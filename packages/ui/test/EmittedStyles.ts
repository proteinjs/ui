/** One emitted style rule that targets a box, with the media blocks that enclose it (outermost first). */
export type EmittedRule = { media: string[]; rule: CSSStyleRule };

/**
 * The rules the rendered components emitted into the document. jsdom lays nothing out, but it does
 * carry the real cascade: emotion injects every rule the components emit into `<style>` elements,
 * and this reads them back for one box — in source order, which IS the cascade, because emotion's
 * selectors are single generated classes.
 */
export class EmittedStyles {
  /** Every emitted rule whose selector matches `box`, at any viewport width, in source order. */
  static matching(box: Element): EmittedRule[] {
    const matching: EmittedRule[] = [];
    const collect = (rules: CSSRuleList, media: string[]) => {
      for (const rule of Array.from(rules)) {
        const block = (rule as CSSMediaRule).media;
        if (block) {
          collect((rule as CSSMediaRule).cssRules, [...media, block.mediaText.trim()]);
          continue;
        }

        const styleRule = rule as CSSStyleRule;
        if (styleRule.selectorText && EmittedStyles.matches(box, styleRule.selectorText)) {
          matching.push({ media, rule: styleRule });
        }
      }
    };
    for (const styleElement of Array.from(document.querySelectorAll('style'))) {
      if (styleElement.sheet) {
        collect(styleElement.sheet.cssRules, []);
      }
    }

    return matching;
  }

  private static matches(box: Element, selectorText: string): boolean {
    try {
      return box.matches(selectorText);
    } catch {
      // A selector jsdom cannot parse (a vendor pseudo-element) targets no box this reads.
      return false;
    }
  }
}
