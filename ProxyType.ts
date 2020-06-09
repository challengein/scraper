import {
  Agent as HttpAgent,
} from 'http';
import {
  Agent as HttpsAgent,
} from 'https';
import type {
  Page,
  Request,
} from 'puppeteer';
import {
  proxyRequest,
} from 'puppeteer-proxy';

/**
 * @property agent HTTP(s) agent to use when making the request.
 * @property page Instance of Puppeteer Page.
 * @property proxyUrl HTTP proxy URL. A different proxy can be set for each request.
 * @property request Instance of Puppeteer Request.
 */
type ProxyRequestConfigurationType = {|
  +agent?: HttpAgent | HttpsAgent,
  +page: Page,
  +proxyUrl?: string,
  +request: Request,
|};

proxyRequest(configuration: ProxyRequestConfigurationType): PageProxyType;