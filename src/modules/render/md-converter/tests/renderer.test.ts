import { WXRenderer } from "@src/modules/render/md-converter/renderer/WXRenderer/WXRenderer.ts";
import { defaultTheme } from "@src/modules/render/md-converter/themes/default.ts";
import { marked } from "npm:marked@4.2.3";

Deno.test("完整渲染测试", () => {
  const renderer = new WXRenderer({ theme: defaultTheme });
  const assemble = renderer.assemble();
  marked.use({ renderer: assemble });
  const content = Deno.readTextFileSync(
    "./src/modules/render/md-converter/tests/test.md",
  );

  const result = marked(content);
  console.log(result);
});
