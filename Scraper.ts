import { Page, Browser } from 'puppeteer';

export abstract class Scraper {
  protected abstract setup(): Promise<{ browser: Browser; page: Page }>;
  abstract run(): void;
}
