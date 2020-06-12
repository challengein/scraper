import { LinkedinScraper } from './scrapers/LinkedinScraper';
const job = process.argv[2] || 'React';
const location = process.argv[3] || 'Berlin';
const maxPages = parseInt(process.argv[4]) || 2;

const linkedinScraper = new LinkedinScraper(job, location, maxPages);
linkedinScraper.run();
