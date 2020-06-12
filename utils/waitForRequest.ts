import { Page } from 'puppeteer';

export const waitForRequest = (page: Page, url: string) => {
  return new Promise(resolve => {
    page.on('request', function callback(request) {
      if (request.url().includes(url)) {
        resolve(request);
        page.removeListener('request', callback);
      }
    });
  });
};
