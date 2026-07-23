const UNSUPPORTED_ELEMENTS = new Set([
  "BR",
  "CODE",
  "DEL",
  "EMBED",
  "FIGCAPTION",
  "FIGURE",
  "HR",
  "IFRAME",
  "IMG",
  "INS",
  "OBJECT",
  "PRE",
  "S",
  "STRIKE",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "U",
  "VIDEO",
]);

const TRANSPARENT_CONTAINER_ELEMENTS = new Set([
  "BODY",
  "DIV",
  "HTML",
  "SECTION",
  "SPAN",
]);

const SUPPORTED_ELEMENTS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "EM",
  "H1",
  "H2",
  "H3",
  "I",
  "LI",
  "OL",
  "P",
  "STRONG",
  "UL",
]);

function isSafeHref(href: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

function hasUnsupportedAttributes(element: Element): boolean {
  if (element.tagName === "A") {
    const href = element.getAttribute("href");
    if (!href || !isSafeHref(href)) {
      return true;
    }

    return [...element.attributes].some(
      (attribute) => attribute.name.toLowerCase() !== "href",
    );
  }

  if (element.tagName === "OL") {
    return [...element.attributes].some(
      (attribute) => attribute.name.toLowerCase() !== "start",
    );
  }

  return element.attributes.length > 0;
}

export function pastedHtmlWasSimplified(html: string): boolean {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return false;
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");

  return [...parsed.body.querySelectorAll("*")].some((element) => {
    if (UNSUPPORTED_ELEMENTS.has(element.tagName)) {
      return true;
    }

    if (
      !SUPPORTED_ELEMENTS.has(element.tagName) &&
      !TRANSPARENT_CONTAINER_ELEMENTS.has(element.tagName)
    ) {
      return true;
    }

    return hasUnsupportedAttributes(element);
  });
}
