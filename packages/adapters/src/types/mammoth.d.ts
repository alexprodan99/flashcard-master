declare module "mammoth" {
  export interface MammothMessage {
    type: "warning" | "error";
    message: string;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export interface MammothInput {
    path?: string;
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
  }

  export interface MammothOptions {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    ignoreEmptyParagraphs?: boolean;
  }

  export function convertToHtml(input: MammothInput, options?: MammothOptions): Promise<MammothResult>;
  export function convertToMarkdown(input: MammothInput, options?: MammothOptions): Promise<MammothResult>;
  export function extractRawText(input: MammothInput): Promise<MammothResult>;

  const mammoth: {
    convertToHtml: typeof convertToHtml;
    convertToMarkdown: typeof convertToMarkdown;
    extractRawText: typeof extractRawText;
  };

  export default mammoth;
}
