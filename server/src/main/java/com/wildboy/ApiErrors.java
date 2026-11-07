package com.wildboy;

import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> api(ApiException e) {
    return ResponseEntity.status(e.status).body(Map.of("code", e.code, "message", e.getMessage()));
  }

  // Missing routes answer JSON 404 directly instead of a Servlet /error re-dispatch that
  // can surface as 401 for authenticated sessions.
  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<?> missing(NoResourceFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(Map.of("code", "NOT_FOUND", "message", "资源不存在"));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> validation(MethodArgumentNotValidException e) {
    var fields = new LinkedHashMap<String, String>();
    e.getBindingResult()
        .getFieldErrors()
        .forEach(
            x ->
                fields.putIfAbsent(
                    x.getField(), Objects.requireNonNullElse(x.getDefaultMessage(), "无效")));
    return ResponseEntity.badRequest()
        .body(Map.of("code", "VALIDATION_ERROR", "message", "请检查填写内容", "fieldErrors", fields));
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
    IllegalArgumentException.class
  })
  ResponseEntity<?> malformed(Exception e) {
    return ResponseEntity.badRequest().body(Map.of("code", "BAD_REQUEST", "message", "请求参数格式错误"));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> integrity(Exception e) {
    return ResponseEntity.status(409).body(Map.of("code", "CONFLICT", "message", "数据已变化，请刷新后重试"));
  }
}
