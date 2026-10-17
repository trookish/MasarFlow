import { defaultUrlTransform } from "react-markdown";

const APP_SCHEMES = /^(wikilink|entity):/i;

/** react-markdown blanks every non-http(s)/mailto URL; MasarFlow's own schemes must survive. */
export function markdownUrlTransform(url: string): string {
  return APP_SCHEMES.test(url) ? url : defaultUrlTransform(url);
}
