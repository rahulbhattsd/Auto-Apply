export interface PageObservation {
  url: string;
  title: string;
  fields: PageField[];
  buttons: PageButton[];
  links: PageLink[];
  // Other observed metadata
}

export interface PageField {
  type: 'text' | 'select' | 'checkbox' | 'radio' | 'file';
  name: string;
  label?: string;
  required: boolean;
  value?: string | string[] | boolean;
  options?: string[]; // for select/radio
  disabled: boolean;
  locator: string;
}

export interface PageButton {
  text: string;
  type: 'submit' | 'button' | 'reset';
  disabled: boolean;
  locator: string;
}

export interface PageLink {
  text: string;
  href: string;
  locator: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  verified: boolean;
}
