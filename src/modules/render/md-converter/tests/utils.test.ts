import { describe, expect, test } from "npm:vitest@2.1.6";
import { makeStyleText } from "@src/modules/render/md-converter/utils/styles.ts";

describe("utils - styles", () => {
  test("makeStyleText", () => {
    // @ts-ignore
    expect(makeStyleText()).toEqual("");
    expect(makeStyleText({})).toEqual("");
    expect(
      makeStyleText({
        "font-style": "italic",
        "font-size": `15px`,
        "line-height": `1.75`,
      }),
    ).toEqual("font-style:italic;font-size:15px;line-height:1.75");
  });
});
