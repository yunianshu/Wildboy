package com.wildboy;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.commonmark.ext.gfm.tables.*;
import org.commonmark.node.*;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.CoreHtmlNodeRenderer;
import org.commonmark.renderer.html.HtmlRenderer;

/**
 * 文章正文：旧版 blocks（文字/图片/表格）与 Markdown 互转，以及 Markdown →
 * 结构化节点 JSON（供小程序原生组件渲染）。
 *
 * 安全约束：延续文章页"仅原生块渲染、不引入 rich-text/web-view"的既定决策，
 * 服务端把 Markdown 解析为受控节点树；图片地址必须通过 safeImage；链接仅
 * 允许 http(s) 与站内相对路径，其余降级为纯文本。不产生 HTML。
 */
public final class ArticleMarkdown {
  /** 保存与转换共同遵守的正文上限。 */
  public static final int MAX_LENGTH = 200_000;

  private static final Parser PARSER =
      Parser.builder().extensions(List.of(TablesExtension.create())).build();

  private static final HtmlRenderer ACTIVITY_RENDERER = HtmlRenderer.builder()
      .extensions(List.of(TablesExtension.create()))
      .escapeHtml(true).sanitizeUrls(true)
      .nodeRendererFactory(context -> new CoreHtmlNodeRenderer(context) {
        @Override public void visit(FencedCodeBlock code) {
          if (WechatFragment.FENCE.equals(code.getInfo())) {
            context.getWriter().raw(WechatFragment.fromFence(code.getLiteral()).html());
          } else {
            super.visit(code);
          }
        }
      }).build();

  private ArticleMarkdown() {}

  // Use the existing sanitized WeChat block protocol so installed mini-programs
  // can display the visual editor's output without an application update.
  static WechatFragment renderActivity(String markdown) {
    return new WechatFragment(ACTIVITY_RENDERER.render(PARSER.parse(markdown)));
  }

  static String fromActivityBlocks(List<ContentModels.Block> blocks) {
    var markdown = new StringBuilder();
    for (var block : blocks) {
      if ("wechat".equals(block.type())) {
        var encoded = Base64.getEncoder().encodeToString(
            block.text().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        markdown.append("```").append(WechatFragment.FENCE).append("\nbase64:")
            .append(encoded).append("\n```\n\n");
      } else {
        markdown.append(fromProductBlocks(List.of(block)));
      }
    }
    return markdown.toString();
  }

  /** 旧版 blocks → Markdown（一次性兼容转换，读路径使用）。 */
  public static String fromBlocks(List<ContentModels.Block> blocks) {
    return fromBlocks(blocks, false);
  }

  static String fromProductBlocks(List<ContentModels.Block> blocks) {
    return fromBlocks(blocks, true);
  }

  private static String fromBlocks(List<ContentModels.Block> blocks, boolean literal) {
    if (blocks == null || blocks.isEmpty()) return "";
    StringBuilder md = new StringBuilder();
    for (var b : blocks) {
      switch (b.type() == null ? "" : b.type()) {
        case "text" -> {
          String text = b.text() == null ? "" : b.text().strip();
          if (!text.isEmpty()) {
            md.append(literal ? escapeText(text) : text).append("\n\n");
          }
        }
        case "image" -> {
          String url = b.url() == null ? "" : b.url();
          String caption = b.caption() == null ? "" : b.caption().strip();
          if (!url.isEmpty()) {
            md.append("![")
                .append(literal ? escapeText(caption).replace('\n', ' ') : caption.replace("[", "(").replace("]", ")"))
                .append("](")
                .append(url.replace("(", "%28").replace(")", "%29"))
                .append(")\n\n");
            if (!literal && !caption.isEmpty()) md.append('*').append(caption).append("*\n\n");
          }
        }
        case "table" -> {
          var rows = b.rows();
          if (rows == null || rows.isEmpty()) continue;
          var header = rows.getFirst();
          if (header == null || header.isEmpty()) continue;
          md.append("| ")
              .append(
                  String.join(
                      " | ",
                      header.stream().map(c -> tableText(c, literal)).toList()))
              .append(" |\n");
          md.append("| ").append("--- |".repeat(header.size()).stripTrailing()).append("\n");
          for (int i = 1; i < rows.size(); i++) {
            var row = rows.get(i);
            if (row == null) continue;
            md.append("| ")
                .append(
                    String.join(
                        " | ",
                        row.stream().map(c -> tableText(c, literal)).toList()))
                .append(" |\n");
          }
          md.append("\n");
        }
        default -> {}
      }
    }
    return md.toString();
  }

  private static String escapeText(String text) {
    return text.replaceAll("[\\p{Punct}]", "\\\\$0");
  }

  private static String tableText(String cell, boolean literal) {
    if (cell == null) return "";
    return literal ? escapeText(cell.replaceAll("\\R", " ")) : cell.replace("|", "\\|");
  }

  /** 便捷入口：从存储的 blocks JSON 转换（读路径使用）。 */
  public static String fromBlocksJson(ObjectMapper json, String blocksJson) {
    if (blocksJson == null || blocksJson.isBlank()) return "";
    try {
      return fromBlocks(
          json.readValue(blocksJson, new TypeReference<List<ContentModels.Block>>() {}));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Invalid stored article blocks", e);
    }
  }

  /** Markdown → 结构化节点 JSON（小程序原生渲染，不含 HTML）。 */
  public static List<Object> toNodes(String markdown) {
    if (markdown == null || markdown.isBlank()) return List.of();
    Node doc = PARSER.parse(markdown);
    doc.accept(new AbstractVisitor() {
      @Override
      public void visit(Image image) {
        String src = image.getDestination();
        if (src == null || !ContentService.safeImage(src)) {
          image.insertBefore(new Text("（图片已移除）"));
          image.unlink();
          return;
        }
        visitChildren(image);
      }

      @Override
      public void visit(Link link) {
        String href = link.getDestination();
        boolean safe =
            href != null
                && (href.matches("https?://.*") || href.startsWith("/") && !href.startsWith("//"));
        if (!safe) {
          String label = link.getFirstChild() instanceof Text text ? text.getLiteral() : "链接";
          link.insertBefore(new Text(label));
          link.unlink();
          return;
        }
        visitChildren(link);
      }
    });
    List<Object> out = new ArrayList<>();
    for (Node n = doc.getFirstChild(); n != null; n = n.getNext()) {
      if (n instanceof BlockQuote quote) {
        // 引文扁平化：内部块加 quote 标记，便于小程序原生渲染
        for (Node child = quote.getFirstChild(); child != null; child = child.getNext()) {
          var node = blockNode(child);
          if (node != null) {
            var flat = new LinkedHashMap<>(node);
            flat.put("quote", true);
            out.add(flat);
          }
        }
        continue;
      }
      var node = blockNode(n);
      if (node != null) out.add(node);
    }
    return out;
  }

  private static Map<String, Object> blockNode(Node n) {
    if (n instanceof Heading h) {
      return Map.of("type", "heading", "level", h.getLevel(), "spans", inlineSpans(n));
    }
    if (n instanceof Paragraph p) {
      // 段落里仅有一张图片时按整图输出
      if (p.getFirstChild() instanceof Image img && img.getNext() == null) {
        return Map.of(
            "type",
            "image",
            "url",
            img.getDestination() == null ? "" : img.getDestination(),
            "caption",
            literal(img));
      }
      return Map.of("type", "paragraph", "spans", inlineSpans(n));
    }
    if (n instanceof BulletList || n instanceof OrderedList list) {
      boolean ordered = n instanceof OrderedList;
      List<Object> items = new ArrayList<>();
      int level = listLevel(n);
      for (Node item = n.getFirstChild(); item != null; item = item.getNext()) {
        List<Object> itemSpans = new ArrayList<>();
        for (Node part = item.getFirstChild(); part != null; part = part.getNext()) {
          if (part instanceof BulletList || part instanceof OrderedList) {
            continue; // 嵌套列表作为独立节点输出
          }
          itemSpans.addAll(inlineSpans(part));
        }
        if (!itemSpans.isEmpty()) items.add(Map.of("spans", itemSpans));
      }
      Map<String, Object> node =
          new LinkedHashMap<>(Map.of("type", "list", "ordered", ordered, "items", items));
      if (level > 0) node.put("level", level);
      return node;
    }
    if (n instanceof BlockQuote quote) {
      List<Object> inner = new ArrayList<>();
      for (Node child = quote.getFirstChild(); child != null; child = child.getNext()) {
        var node = blockNode(child);
        if (node != null) inner.add(node);
      }
      return Map.of("type", "quote", "blocks", inner);
    }
    if (n instanceof FencedCodeBlock code) {
      if (WechatFragment.FENCE.equals(code.getInfo())) {
        try {
          return Map.of("type", "wechat", "nodes", WechatFragment.fromFence(code.getLiteral()).nodes());
        } catch (ApiException e) {
          // A hand-written Markdown fence is still a valid document.
          return Map.of("type", "paragraph", "spans", List.of(Map.of("t", "text", "s", e.getMessage())));
        }
      }
      return Map.of("type", "code", "text", code.getLiteral().strip());
    }
    if (n instanceof IndentedCodeBlock code) {
      return Map.of("type", "code", "text", code.getLiteral().strip());
    }
    if (n instanceof ThematicBreak) {
      return Map.of("type", "hr");
    }
    if (n instanceof TableBlock table) {
      List<Object> head = new ArrayList<>();
      List<Object> rows = new ArrayList<>();
      for (Node section = table.getFirstChild(); section != null; section = section.getNext()) {
        if (section instanceof TableHead) {
          for (Node row = section.getFirstChild(); row != null; row = row.getNext()) {
            for (Node cell = row.getFirstChild(); cell != null; cell = cell.getNext()) {
              if (cell instanceof TableCell tc) head.add(inlineSpans(tc));
            }
          }
        } else if (section instanceof TableBody) {
          for (Node row = section.getFirstChild(); row != null; row = row.getNext()) {
            List<Object> cells = new ArrayList<>();
            for (Node cell = row.getFirstChild(); cell != null; cell = cell.getNext()) {
              if (cell instanceof TableCell tc) cells.add(inlineSpans(tc));
            }
            rows.add(cells);
          }
        }
      }
      return Map.of("type", "table", "head", head, "rows", rows);
    }
    return null; // 其余节点类型不输出
  }

  /** 嵌套列表层级：上层列表数量（顶层为 0）。 */
  private static int listLevel(Node node) {
    int depth = 0;
    for (Node parent = node.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof BulletList || parent instanceof OrderedList) depth++;
    }
    return depth;
  }

  /** 行内内容 → spans：{t: text|bold|italic|code|link, s, href?} */
  private static List<Object> inlineSpans(Node parent) {
    List<Object> spans = new ArrayList<>();
    for (Node n = parent.getFirstChild(); n != null; n = n.getNext()) {
      if (n instanceof Text t) {
        appendSpan(spans, "text", t.getLiteral(), null);
      } else if (n instanceof StrongEmphasis strong) {
        appendSpan(spans, "bold", literal(strong), null);
      } else if (n instanceof Emphasis em) {
        appendSpan(spans, "italic", literal(em), null);
      } else if (n instanceof Code code) {
        appendSpan(spans, "code", code.getLiteral(), null);
      } else if (n instanceof Link link) {
        appendSpan(spans, "link", literal(link), link.getDestination());
      } else if (n instanceof SoftLineBreak || n instanceof HardLineBreak) {
        appendSpan(spans, "text", "\n", null);
      } else if (n instanceof Image image) {
        // 行内图片：以文字占位标注，整图输出仅限独立成段的图片
        appendSpan(spans, "text", image.getDestination() == null ? "" : "[图片]", null);
      } else if (n != null) {
        appendSpan(spans, "text", literal(n), null);
      }
    }
    return spans;
  }

  private static void appendSpan(List<Object> spans, String type, String text, String href) {
    if (text == null || text.isEmpty()) return;
    if (!spans.isEmpty()) {
      var last = new LinkedHashMap<>((Map<String, Object>) spans.getLast());
      if (last.get("t").equals(type) && Objects.equals(last.get("href"), href)) {
        last.put("s", last.get("s") + text);
        spans.set(spans.size() - 1, last);
        return;
      }
    }
    var span = new LinkedHashMap<String, Object>();
    span.put("t", type);
    span.put("s", text);
    if (href != null) span.put("href", href);
    spans.add(span);
  }

  private static String literal(Node node) {
    StringBuilder sb = new StringBuilder();
    for (Node n = node.getFirstChild(); n != null; n = n.getNext()) {
      if (n instanceof Text t) sb.append(t.getLiteral());
      else if (n instanceof Code c) sb.append(c.getLiteral());
      else sb.append(literal(n));
    }
    return sb.toString();
  }
}
