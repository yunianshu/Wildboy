type EditorParser = { VditorDOM2Md: (html: string) => string };

export function serializeBlockOrder(elements: Element[], parser: EditorParser) {
  // Without a different list marker, Markdown joins two adjacent lists after a
  // duplicate or move. Alternate only the outer lists that would run together.
  let previousTag = "";
  let previousMarker = "";
  const html = elements
    .map((original) => {
      const element = original.cloneNode(true) as Element;
      const marker = element.getAttribute("data-marker") ?? "";
      let suffix = marker.slice(-1);
      if (
        element.matches("ul, ol") &&
        previousTag === element.tagName &&
        previousMarker === suffix
      ) {
        suffix =
          element.tagName === "UL"
            ? suffix === "*"
              ? "-"
              : "*"
            : suffix === "."
              ? ")"
              : ".";
        for (const item of [element, ...element.children]) {
          const current = item.getAttribute("data-marker");
          if (current)
            item.setAttribute("data-marker", current.slice(0, -1) + suffix);
        }
      }
      previousMarker = suffix;
      previousTag = element.tagName;
      return element.outerHTML;
    })
    .join("");
  const markdown = parser.VditorDOM2Md(html);
  // Leading "---" is also the YAML front-matter delimiter in Vditor.
  return elements[0]?.tagName === "HR"
    ? markdown.replace(/^---(?=\n)/, "***")
    : markdown;
}
