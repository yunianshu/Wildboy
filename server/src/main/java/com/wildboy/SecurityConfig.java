package com.wildboy;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {
  @Bean
  SecurityFilterChain security(
      HttpSecurity http,
      AuthService auth,
      ObjectMapper mapper,
      @Value("${wildboy.cors-origins}") String origins)
      throws Exception {
    var configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::strip).toList());
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    configuration.setMaxAge(3600L);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    http.csrf(c -> c.disable())
        .cors(c -> c.configurationSource(source))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(
                        "/actuator/health",
                        "/api/v1/auth/**",
                        "/api/v1/home",
                        "/api/v1/legal/**",
                        "/assets/**")
                    .permitAll()
                    .requestMatchers(
                        org.springframework.http.HttpMethod.GET,
                        "/api/v1/articles",
                        "/api/v1/articles/*",
                        "/api/v1/activities",
                        "/api/v1/activities/*",
                        "/api/v1/shop/products",
                        "/api/v1/shop/products/*",
                        "/api/v1/activities/*/content",
                        "/api/v1/media/*",
                        "/api/v1/shop/products/*/content")
                    .permitAll()
                    .requestMatchers("/api/v1/payments/wechat/notify", "/api/v1/payments/wechat/refund-notify")
                    .permitAll()
                    .requestMatchers("/api/v1/admin/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (req, res, ex) -> error(res, 401, "UNAUTHENTICATED", "请先登录", mapper))
                    .accessDeniedHandler(
                        (req, res, ex) -> error(res, 403, "FORBIDDEN", "无操作权限", mapper)));
    http.addFilterBefore(
        new OncePerRequestFilter() {
          final ConcurrentHashMap<String, long[]> buckets = new ConcurrentHashMap<>();

          @Override
          protected void doFilterInternal(
              HttpServletRequest req, HttpServletResponse res, FilterChain chain)
              throws ServletException, IOException {
            if (req.getRequestURI().startsWith("/api/v1/auth/") && req.getMethod().equals("POST")) {
              long minute = System.currentTimeMillis() / 60000;
              String ip = req.getRemoteAddr();
              if (buckets.size() > 10000)
                buckets.entrySet().removeIf(e -> e.getValue()[0] < minute);
              if (buckets.size() >= 10000 && !buckets.containsKey(ip)) {
                error(res, 429, "RATE_LIMITED", "登录繁忙，请稍后重试", mapper);
                return;
              }
              long[] count =
                  buckets.compute(
                      ip,
                      (k, v) ->
                          v == null || v[0] != minute
                              ? new long[] {minute, 1}
                              : new long[] {minute, v[1] + 1});
              if (count[1] > 20) {
                error(res, 429, "RATE_LIMITED", "登录尝试过多，请稍后重试", mapper);
                return;
              }
            }
            String header = req.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
              var user = auth.authenticate(header.substring(7));
              if (user != null) {
                var principal =
                    new UsernamePasswordAuthenticationToken(
                        user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role())));
                SecurityContextHolder.getContext().setAuthentication(principal);
              }
            }
            res.setHeader("Cache-Control", "no-store");
            chain.doFilter(req, res);
          }
        },
        UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  static void error(
      HttpServletResponse res, int status, String code, String message, ObjectMapper mapper)
      throws IOException {
    res.setStatus(status);
    res.setContentType("application/json;charset=UTF-8");
    mapper.writeValue(res.getOutputStream(), Map.of("code", code, "message", message));
  }
}
