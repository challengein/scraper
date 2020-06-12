import { Page } from 'puppeteer';

export const waitForResponse = (page: Page, url: string) => {
  return new Promise(resolve => {
    page.on('response', function callback(response) {
      if (response.url().includes(url)) {
        resolve(response);
        page.removeListener('response', callback);
      }
    });
  });
};
