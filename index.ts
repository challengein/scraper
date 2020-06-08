import { LinkedinScraper } from './scrapers/LinkedinScraper';
const job = process.argv[2] || 'React';
const location = process.argv[3] || 'Berlin';

const linkedinScraper = new LinkedinScraper(job, location);
linkedinScraper.run();
