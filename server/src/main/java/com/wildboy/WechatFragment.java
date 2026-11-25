package com.wildboy;

import java.util.*;
import java.util.regex.Pattern;
import java.nio.charset.StandardCharsets;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;

/** Translates clipboard HTML into the small display vocabulary shared by the editors and reader. */
final class WechatFragment {
  static final String FENCE = "wildboy-wechat";
  static final int MAX_HTML = 190_000;
  private static final String[] TAGS = ("a b blockquote br caption code col colgroup dd del div dl dt em " +
      "h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tr u ul").split(" ");
  private static final Safelist ALLOWED = new Safelist().addTags(TAGS)
      .addAttributes(":all", "style").addAttributes("img", "src", "alt")
      .addAttributes("a", "href").addAttributes("ol", "start")
      .addAttributes("td", "colspan", "rowspan").addAttributes("th", "colspan", "rowspan")
      .addAttributes("col", "span");
  private static final Pattern PROPERTY = Pattern.compile(
      "color|background-color|font-(?:family|size|style|weight)|letter-spacing|line-height|text-(?:align|decoration|indent)|" +
      "vertical-align|white-space|word-break|width|max-width|height|display|flex(?:-direction|-wrap|-grow|-shrink|-basis)?|gap|align-items|justify-content|" +
      "list-style-type|border(?:-(?:top|bottom|left|right)(?:-color|-style|-width)?|-(?:width|style|color|radius|collapse))?|" +
      "(?:padding|margin)(?:-(?:top|bottom|left|right))?");
  private static final Pattern VALUE = Pattern.compile("[\\p{L}0-9\\s#.,%'\"/+\\-]+");
  private static final Pattern COLOR_FUNCTION = Pattern.compile("(?i)(?:rgb|hsl)a?\\([\\d\\s.,/%+\\-]{3,64}\\)");
  private static final Pattern LINK = Pattern.compile("(?i)https://[^\\s<>\"'\\\\]+");

  private final Element body;
  private final List<String> warnings = new ArrayList<>();

  static WechatFragment fromFence(String literal) {
    String value = literal.strip();
    if (!value.startsWith("base64:")) return new WechatFragment(value);
    try {
      byte[] utf8 = Base64.getDecoder().decode(value.substring("base64:".length()));
      return new WechatFragment(new String(utf8, StandardCharsets.UTF_8));
    } catch (IllegalArgumentException e) {
      throw invalid("公众号片段格式不完整，请重新粘贴原文");
    }
  }

  WechatFragment(String raw) {
    if (raw == null || raw.length() > 1_000_000) throw invalid("请将较长的公众号正文分段粘贴");
    Document input = Jsoup.parseBodyFragment(raw);
    if (input.getAllElements().size() > 10000) throw invalid("排版元素较多，请分段粘贴");
    if (!input.select("iframe, video, audio, mpvoice, mp-common-profile, mp-common-videosnap, svg, canvas").isEmpty())
      warnings.add("音视频、动效或微信互动卡片未导入");
    input.select("script, style, template, noscript, form, iframe, object, embed, video, audio, mpvoice, mp-common-profile, mp-common-videosnap, svg, canvas").remove();
    for (Element node : input.select("section,article,main,figure,figcaption,center,font")) {
      String tag = node.normalName();
      if (tag.equals("center")) node.attr("style", node.attr("style") + ";text-align:center");
      if (tag.equals("font") && node.hasAttr("color")) node.attr("style", node.attr("style") + ";color:" + node.attr("color"));
      node.tagName(tag.equals("font") ? "span" : "div");
    }
    int missing = 0;
    for (Element img : input.select("img")) {
      String source = "";
      for (String attr : List.of("data-src", "data-original", "data-actualsrc", "src")) {
        String url = img.attr(attr).strip();
        if (url.startsWith("//")) url = "https:" + url;
        if (url.startsWith("http://")) url = "https://" + url.substring(7);
        if (ContentService.safeImage(url)) { source = url; break; }
      }
      if (source.isEmpty()) {
        missing++;
        img.replaceWith(new TextNode(img.attr("alt").isBlank() ? "〔图片待补充〕" : img.attr("alt")));
      } else {
        img.attr("src", source);
        // Images without an inline width should stay within the phone viewport.
        String width = img.attr("width");
        String fallback = width.matches("[1-9][0-9]{0,3}%?") ? "width:" + width + (width.endsWith("%") ? ";" : "px;") : "";
        img.attr("style", fallback + img.attr("style") + ";max-width:100%;height:auto");
      }
    }
    if (missing > 0) warnings.add(missing + " 张图片缺少可读取的地址，请补充原图");
    Document clean = new Cleaner(ALLOWED).clean(input);
    clean.outputSettings().prettyPrint(false);
    body = clean.body();
    for (Element el : body.getAllElements()) {
      if (el.parents().size() > 60) throw invalid("排版嵌套过多，请分段粘贴");
      if (el.hasAttr("style")) {
        String style = cleanStyle(el.attr("style"));
        if (style.isEmpty()) el.removeAttr("style"); else el.attr("style", style);
      }
      if (el.hasAttr("href") && !LINK.matcher(el.attr("href")).matches()) el.removeAttr("href");
      for (String attr : List.of("span", "rowspan", "colspan", "start")) {
        if (el.hasAttr(attr) && !el.attr(attr).matches("[1-9][0-9]{0,2}")) el.removeAttr(attr);
      }
    }
    if (body.html().length() > MAX_HTML) throw invalid("排版内容较长，请分段粘贴");
  }

  private static String cleanStyle(String style) {
    Map<String, String> result = new LinkedHashMap<>();
    for (String rule : style.split(";")) {
      int split = rule.indexOf(':');
      if (split < 1) continue;
      String property = rule.substring(0, split).strip().toLowerCase(Locale.ROOT);
      String value = rule.substring(split + 1).replaceFirst("(?i)\\s*!important\\s*$", "").strip();
      if (property.equals("background")) property = "background-color";
      if (!PROPERTY.matcher(property).matches() || value.length() > 180 || value.isEmpty()) continue;
      // Only color functions can contain parentheses. No URLs, custom properties or escapes.
      if (!VALUE.matcher(COLOR_FUNCTION.matcher(value).replaceAll("color")).matches()) continue;
      if (property.equals("display") && !Set.of("block", "inline", "inline-block", "flex", "inline-flex", "table", "table-cell").contains(value)) continue;
      result.put(property, value);
    }
    StringJoiner css = new StringJoiner(";");
    result.forEach((k,v) -> css.add(k + ":" + v));
    return css.toString();
  }

  String html() { return body.html(); }
  List<Element> images() { return body.select("img[src]"); }
  List<String> warnings() { return warnings; }
  boolean hasContent() { return !body.text().isBlank() || !images().isEmpty() || body.selectFirst("hr") != null; }
  List<Object> nodes() { return nodes(body); }

  private static List<Object> nodes(Element parent) {
    List<Object> nodes = new ArrayList<>();
    for (Node child : parent.childNodes()) {
      if (child instanceof TextNode text) {
        nodes.add(Map.of("type", "text", "text", text.getWholeText()));
      } else if (child instanceof Element element) {
        Map<String,String> attrs = new LinkedHashMap<>();
        for (Attribute attr : element.attributes()) attrs.put(attr.getKey(), attr.getValue());
        nodes.add(Map.of("name", element.normalName(), "attrs", attrs, "children", nodes(element)));
      }
    }
    return nodes;
  }

  static ApiException invalid(String message) {
    return new ApiException(400, "INVALID_WECHAT_CONTENT", message);
  }
}
