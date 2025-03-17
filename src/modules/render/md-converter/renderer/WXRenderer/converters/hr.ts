import { Theme } from "@src/modules/render/md-converter/themes/types.ts";
import {
  ConverterFunc,
  MarkdownElement,
} from "@src/modules/render/md-converter/types/index.ts";
import { makeStyleText } from "@src/modules/render/md-converter/utils/styles.ts";

export const HRConverter: ConverterFunc<MarkdownElement.HR> = (
  styles: Theme,
) => {
  return `<hr style="${makeStyleText(styles.hr)}" />`;
};

export const HRConverterFactory = (styles: Theme) => {
  return () => HRConverter(styles);
};
