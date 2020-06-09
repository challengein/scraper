import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();
import { wait } from '../utils/wait';
import { logger } from '../logger';
import userAgent from 'user-agents';
import { Scraper } from '../Scraper';
import fs from 'fs';
import util from 'util';

const asyncWriteFile = util.promisify(fs.writeFile);

enum Constants {
  USERNAME_INPUT = '#username',
  PASSWORD_INPUT = '#password',
  SIGNIN_BTN = '.login__form_action_container button[type=submit]',
  JOBS_CONTAINER = '.jobs-search-two-pane__results',
  JOB_TITLE = '.job-card-list__title',
  COMPANY = '.job-card-container__company-name',
  DATE_POSTED_BTN = 'button[aria-controls="date-posted-facet-values"]',
  RADIO_BTN = '.search-s-facet-value__name',
  APPLY_BTN = 'button[data-control-name="filter_pill_apply"]',
  JOB_CARD = '.job-card-container',
  SEARCH_JOB_TITLE_INPUT = '.jobs-search-box__input--keyword input[type=text]',
  SEARCH_LOCATION_INPUT = '.jobs-search-box__input--location input[type=text]',
  SEARCH_SUBMIT_BTN = '.jobs-search-box button[type=submit]',
  PAGINATION_BTNS = '.artdeco-pagination__pages button'
}

interface JobInfo {
  job: string | undefined;
  company: string | undefined;
  companyId: number | undefined;
  timestamp: string | undefined;
}

class LinkedinScraper extends Scraper {
  protected baseUrl = 'https://www.linkedin.com/';
  protected loginPage = this.baseUrl + 'login';
  protected jobsPage = this.baseUrl + 'jobs';
  protected data: JobInfo[] = [];
  protected tag = 'Linkedin scraper';

  constructor(private jobPosition: string, private location: string) {
    super();
  }

  protected async setup() {
    const browser = await puppeteer.launch({
      headless: true,
      slowMo: 10,
      defaultViewport: null
    });
    return { browser, page: await browser.newPage() };
  }

  protected async login(page: puppeteer.Page) {
    try {
      await page.goto(this.loginPage);
      await page.waitForSelector(Constants.USERNAME_INPUT);
      await page.click(Constants.USERNAME_INPUT);
      await page.keyboard.type(process.env.login as string);
      await page.click(Constants.PASSWORD_INPUT);
      await page.keyboard.type(process.env.password as string);
      logger.info(`${this.tag}: `, `try to sign in..`);
      await page.click(Constants.SIGNIN_BTN);
      await page.waitForNavigation();
    } catch (err) {
      logger.info(`${this.tag}: `, err);
      await page.screenshot({ path: 'loginError.png' });
      process.exit(1);
    }
  }

  protected async searchJobs(page: puppeteer.Page) {
    try {
      await page.setUserAgent(userAgent.toString());
      await page.goto(this.jobsPage);
      await page.waitForSelector(Constants.SEARCH_JOB_TITLE_INPUT);
      await page.click(Constants.SEARCH_JOB_TITLE_INPUT);
      await page.keyboard.type(this.jobPosition);
      await page.click(Constants.SEARCH_LOCATION_INPUT);
      await page.keyboard.type(this.location);
      await page.click(Constants.SEARCH_SUBMIT_BTN);
      await page.waitForNavigation();
      await page.click(Constants.DATE_POSTED_BTN);
      await page.click(Constants.RADIO_BTN);
      await page.click(Constants.APPLY_BTN);
      logger.info(
        `${this.tag}: `,
        `try to search jobs.., ${this.jobPosition} - ${this.location}`
      );
      await wait();
    } catch (err) {
      logger.error(`${this.tag}: `, err);
      await page.screenshot({ path: 'searchJobsError.png' });
      process.exit(1);
    }
  }

  protected async getData(page: puppeteer.Page) {
    try {
      const freshData = await page.evaluate(
        async (JOBS_CONTAINER, JOB_TITLE, COMPANY, JOB_CARD) => {
          const dataArr: any = [];

          const div = document.querySelector(JOBS_CONTAINER) as Element;

          div.scrollTo({
            top: div.scrollHeight / 2,
            left: 0,
            behavior: 'smooth'
          });
          await wait();

          div.scrollTo({
            top: div.scrollHeight,
            left: 0,
            behavior: 'smooth'
          });

          await wait();

          const paginationBtn = document.querySelector(
            Constants.PAGINATION_BTNS
          ) as HTMLElement;

          paginationBtn.scrollIntoView();

          div && (div.scrollTop = div.scrollHeight);

          const cards = document.querySelectorAll(JOB_CARD);

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
        Constants.JOBS_CONTAINER,
        Constants.JOB_TITLE,
        Constants.COMPANY,
        Constants.JOB_CARD
      );
      this.data = [...this.data, ...freshData];
    } catch (err) {
      logger.error(`${this.tag}: `, err);
      await page.screenshot({ path: 'getDataError.png' });
      process.exit(1);
    }
  }

  protected async loadMore(page: puppeteer.Page) {
    try {
      await page.evaluate(PAGINATION_BTNS => {
        const btns = Array.from(document.querySelectorAll(PAGINATION_BTNS));
        const curBtnIndex = btns.findIndex(btn => {
          const span = btn.querySelector('.ally-text');
          return span?.textContent === 'Current page';
        });
        if (curBtnIndex) {
          const nextBtn = btns[curBtnIndex + 1];
          if (nextBtn) {
            nextBtn.click() as HTMLElement;
            logger.info(
              `${this.tag}: `,
              `scraping...: page ${curBtnIndex + 2}, ${this.jobPosition} - ${
                this.location
              }`
            );
          }
        }
      }, Constants.PAGINATION_BTNS);
      await wait();
      await this.getData(page);
    } catch (err) {
      logger.error(`${this.tag}: `, err);
      await page.screenshot({ path: 'loadMoreError.png' });
      process.exit(1);
    }
  }

  public async run() {
    logger.info(`${this.tag}: `, `Start scraping..`);
    const { page, browser } = await this.setup();
    await this.login(page);
    await this.searchJobs(page);
    logger.info(
      `${this.tag}: `,
      `data scraping, ${this.jobPosition} - ${this.location}`
    );
    await this.getData(page);
    this.loadMore(page);
    await browser.close();
    await asyncWriteFile('./linkedin_jobs.json', JSON.stringify(this.data));
    logger.info(`${this.tag}: `, `Scraping finished`);
    process.exit(1);
  }
}

export { LinkedinScraper };
