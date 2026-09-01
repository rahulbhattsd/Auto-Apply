export interface ApplicationAdapter {
  canHandle(url: string): boolean;
  inspect(page: unknown, url: string): Promise<Record<string, unknown>>;
  fill(page: unknown, profile: unknown, resumePath: string): Promise<void>;
  submit(page: unknown): Promise<boolean>;
}
