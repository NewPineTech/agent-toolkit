const DEFAULT_API_URL = 'http://localhost:3000';

let configuredApiUrl: string | undefined;

export function configureWidget(options: { apiUrl: string }) {
  configuredApiUrl = options.apiUrl.replace(/\/$/, '');
}

export function getApiUrl(): string {
  return configuredApiUrl ?? DEFAULT_API_URL;
}
