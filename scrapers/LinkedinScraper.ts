import puppeteer, { Page, Browser } from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();
import { logger } from '../logger';
import UserAgent from 'user-agents';
import { Scraper } from '../Scraper';
import fs from 'fs';
import util from 'util';
import { waitForResponse } from '../utils/waitForResponse';
import { waitForRequest } from '../utils/waitForRequest';

const asyncWriteFile = util.promisify(fs.writeFile);

enum Constants {
  USERNAME_INPUT = '#username',
  PASSWORD_INPUT = '#password',
  SIGNIN_BTN = '.login__form_action_container button[type=submit]',
  JOBS_CONTAINER = '.jobs-search-results--is-two-pane',
  JOB_TITLE = '.job-card-list__title',
  COMPANY = '.job-card-container__company-name',
  DATE_POSTED_BTN = 'button[aria-label="Date Posted filter. Clicking this button displays all Date Posted filter options."]',
  RADIO_BTNS_CONTAINER = '#date-posted-facet-values ul.search-s-facet__list',
  APPLY_BTN = 'button[data-control-name="filter_pill_apply"]',
  JOB_CARD = '.job-card-container',
  SEARCH_JOB_TITLE_INPUT = '.jobs-search-box__input--keyword input[type=text]',
  SEARCH_LOCATION_INPUT = '.jobs-search-box__input--location input[type=text]',
  SEARCH_SUBMIT_BTN = 'button[type=submit].jobs-search-box__submit-button',
  CURRENT_PAGE_BTN_CONTAINER = '.artdeco-pagination__indicator--number.selected',
  MESSAGES_BTN = '.msg-overlay-bubble-header__button',
  MESSAGES_OVERLAY = '.msg-overlay-bubble-header[data-control-name="overlay.minimize_connection_list_bar"]',
  PROFILE = '.profile-rail-card__actor-link',
  FILTERS = '.search-filters-bar',
  PAGINATION = '.artdeco-pagination__pages',
  JOB_LIST_ITEM = '.artdeco-list__item'
}

interface JobInfo {
  job: string | undefined;
  company: string | undefined;
  companyId: number | undefined;
  timestamp: string | undefined;
}

class LinkedinScraper extends Scraper {
  protected baseUrl = 'https://www.linkedin.com/';
  protected updateEventUrl = 'https://lnkd.demdex.net/event';
  protected loginPage = this.baseUrl + 'login';
  protected jobsPage = this.baseUrl + 'jobs';
  protected data: JobInfo[] = [];
  protected tag = 'Linkedin scraper';
  protected currentPage = 1;
  protected continue = true;

  constructor(
    private jobPosition: string,
    private location: string,
    private maxPages: number
  ) {
    super();
  }

  protected async setup() {
    const browser = await puppeteer.launch({
      headless: false,
      slowMo: 50,
      userDataDir: './data',
      // args: ['--start-maximized'],
      executablePath: process.env.path || undefined,
      defaultViewport: null
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    await page.setUserAgent(userAgent.toString());

    return { browser, page };
  }

  protected async chechForLoggedIn(page: Page) {
    await page.goto(this.baseUrl, {
      waitUntil: 'load',
      // Remove the timeout
      timeout: 0
    });
    if ((await page.$(Constants.PROFILE)) !== null) return true;
  }

  protected async login(page: Page) {
    try {
      await page.goto(this.loginPage, {
        waitUntil: 'load',
        // Remove the timeout
        timeout: 0
      });

      await page.click(Constants.USERNAME_INPUT);
      await page.waitFor(500);
      await page.keyboard.type(process.env.login as string);
      await page.click(Constants.PASSWORD_INPUT);
      await page.waitFor(500);
      await page.keyboard.type(process.env.password as string);
      logger.info(`${this.tag}: `, `try to sign in..`);
      await page.click(Constants.SIGNIN_BTN);
      await page.waitForNavigation();
    } catch (err) {
      logger.info(`${this.tag}: loginError: `, err);
      await page.screenshot({ path: 'loginError.png' });
      process.exit(1);
    }
  }

  protected async set24hFilter(page: Page) {
    try {
      await this.waitForUpdateEventResponse(page);

      await page.waitFor(Constants.FILTERS);
      await page.evaluate(DATE_POSTED_BTN => {
        const dropdownBtn = document.querySelector(DATE_POSTED_BTN);
        dropdownBtn && dropdownBtn.click();
      }, Constants.DATE_POSTED_BTN);
      await page.waitFor(500);

      if ((await page.$(Constants.RADIO_BTNS_CONTAINER)) === null)
        return logger.error(`${this.tag}:`, 'cant find RADIO_BTNS_CONTAINER');
      await page.evaluate(RADIO_BTNS_CONTAINER => {
        const radioBtnsContainer = document.querySelector(RADIO_BTNS_CONTAINER);
        radioBtnsContainer &&
          radioBtnsContainer.children[0].children[1].click();
      }, Constants.RADIO_BTNS_CONTAINER);
      await page.waitFor(500);

      if ((await page.$(Constants.APPLY_BTN)) === null)
        return logger.error(`${this.tag}:`, 'cant find APPLY_BTN');
      await page.evaluate(APPLY_BTN => {
        const btn = document.querySelector(APPLY_BTN);
        btn && btn.click();
      }, Constants.APPLY_BTN);
      await this.waitForUpdateEventResponse(page);
    } catch (err) {
      logger.error(`${this.tag}:`, err);
    }
  }

  protected async waitForUpdateEventResponse(page: Page) {
    await waitForRequest(page, this.updateEventUrl);
    await waitForResponse(page, this.updateEventUrl);
  }

  protected async closeMessenger(page: Page) {
    const localStorage = await page.evaluate(() =>
      Object.assign({}, window.localStorage)
    );
    try {
      const messagesState = JSON.parse(
        localStorage['voyager-web:msg-overlay-state']
      );
      const isMinimized = messagesState[0]._listBubble.isMinimized;
      if (!isMinimized) {
        await page.waitFor(Constants.MESSAGES_BTN);
        await page.evaluate(MESSAGES_BTN => {
          const btn = document.querySelector(MESSAGES_BTN) as HTMLElement;
          btn && btn.click();
        }, Constants.MESSAGES_BTN);
      }
    } catch (err) {
      logger.error('closeMessenger:', err);
    }
  }

  protected async searchJobs(page: Page) {
    try {
      await page.goto(this.jobsPage, {
        waitUntil: 'load',
        // Remove the timeout
        timeout: 0
      });

      await page.waitFor(Constants.SEARCH_JOB_TITLE_INPUT);
      await page.click(Constants.SEARCH_JOB_TITLE_INPUT);
      await page.waitFor(1000);
      await page.keyboard.type(this.jobPosition);

      await page.click(Constants.SEARCH_LOCATION_INPUT);
      await page.waitFor(1000);
      await page.keyboard.type(this.location);

      await page.evaluate(SEARCH_SUBMIT_BTN => {
        const btn = document.querySelector(SEARCH_SUBMIT_BTN);
        btn.click();
      }, Constants.SEARCH_SUBMIT_BTN);

      logger.info(
        `${this.tag}: `,
        `try to search jobs.., ${this.jobPosition} - ${this.location}`
      );
    } catch (err) {
      logger.error(`${this.tag}: searchJobsErro: `, err);
      await page.screenshot({ path: 'searchJobsError.png' });
      process.exit(1);
    }
  }

  protected async getData(page: Page) {
    try {
      await page.waitFor(3000);
      await page.waitForSelector(Constants.JOBS_CONTAINER);
      let i = 25;

      i = await page.evaluate(
        JOB_LIST_ITEM => {
          const cards = document.querySelectorAll(JOB_LIST_ITEM);
          return cards.length;
        },
        Constants.JOB_LIST_ITEM,
        i
      );
      while (i >= 0) {
        await page.evaluate(
          (JOBS_CONTAINER, i) => {
            const div = document.querySelector(JOBS_CONTAINER) as Element;

            div.scrollTo({
              top: i > 0 ? div.scrollHeight / i : div.scrollHeight,
              left: 0,
              behavior: 'smooth'
            });
          },
          Constants.JOBS_CONTAINER,
          i
        );
        await page.waitFor(50);
        i === 0 && (await page.waitFor(1000));
        i--;
      }
      const freshData = await page.evaluate(
        (JOB_TITLE, COMPANY, JOB_LIST_ITEM) => {
          const dataArr: any = [];

          const cards = document.querySelectorAll(JOB_LIST_ITEM);

          cards.forEach(card => {
            const jobTitle = card.querySelector(JOB_TITLE);
            const company = card.querySelector(COMPANY);
            const time = card.querySelector('time');
            dataArr.push({
              job: jobTitle?.textContent.trim(),
              company: company?.textContent.trim(),
              companyId: company?.href.match(/\d+/g)[0].trim(),
              timestamp: `${time?.getAttribute(
                'datetime'
              )}: ${time?.textContent.trim()}`
            });
          });

          return dataArr;
        },
        Constants.JOB_TITLE,
        Constants.COMPANY,
        Constants.JOB_LIST_ITEM
      );
      logger.info(`${this.tag}: `, `+${freshData.length} jobs`);
      this.data = [...this.data, ...freshData];
      await this.loadMore(page);
    } catch (err) {
      logger.error(`${this.tag}: getDataError: `, err);
      await page.screenshot({ path: 'getDataError.png' });
      process.exit(1);
    }
  }

  protected async loadMore(page: Page) {
    try {
      if ((await page.$(Constants.PAGINATION)) === null) return;
      const stop = await page.evaluate(CURRENT_PAGE_BTN_CONTAINER => {
        const curBtnContainer = document.querySelector(
          CURRENT_PAGE_BTN_CONTAINER
        );
        if (!curBtnContainer || !curBtnContainer.nextElementSibling) {
          return true;
        }
        const nextBtn = curBtnContainer.nextElementSibling.children[0];
        nextBtn && nextBtn.click();
      }, Constants.CURRENT_PAGE_BTN_CONTAINER);

      await page.waitFor(3000);

      if (!stop && this.currentPage < this.maxPages) {
        this.currentPage++;
      } else {
        this.continue = false;
      }
    } catch (err) {
      logger.error(`${this.tag}: loadMoreError: `, err);
      await page.screenshot({ path: 'loadMoreError.png' });
      process.exit(1);
    }
  }

  protected async finishScrapping(browser: Browser) {
    await browser.close();
    await asyncWriteFile('./linkedin_jobs.json', JSON.stringify(this.data));
    logger.info(`${this.tag}: `, `Scraping finished: ${this.data.length} jobs`);
  }

  public async run() {
    logger.info(`${this.tag}: `, `Start scraping..`);
    const { page, browser } = await this.setup();
    const isLoggedIn = await this.chechForLoggedIn(page);
    !isLoggedIn && (await this.login(page));
    await this.closeMessenger(page);
    await this.searchJobs(page);
    await this.set24hFilter(page);
    logger.info(
      `${this.tag}: `,
      `data scraping, ${this.jobPosition} - ${this.location}`
    );
    while (this.continue) {
      await this.getData(page);
    }
    await this.finishScrapping(browser);
  }
}

export { LinkedinScraper };
