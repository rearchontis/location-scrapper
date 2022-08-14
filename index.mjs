import { open, rm, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

try {
    const folderhandle = await open('./generated');
    await rm('./generated', { recursive: true, force: true });
    await folderhandle.close();
} catch (error) {
    // TODO: handle open or delete folder error
} finally {
    await mkdir('./generated');
}

const baseURL = 'https://en.wikipedia.org';

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(baseURL + '/w/index.php?title=Category:First-level_administrative_divisions_by_country');

// TODO: shrink this into abstact class/function with * parseRegions()
// TODO: refactor with `for await ... of` to remove nullable entries and need in .flat()
const catalog = await page.$('#mw-subcategories');
const countries = await Promise.all((await catalog.$$('.mw-category-group')).map(async (category) => {
    const regex = /[A-Z]/gi;
    const index = await category.$('h3');

    if (regex.test(await index.textContent())) {
        const group = await category.$('ul');

        return await Promise.all((await group.$$('li')).map(async (element) => {
            const link = await element.$('a');
            const href = await link.getAttribute('href');
            const name = await link.textContent();

            // Oblasts of Ukraine
            const [regions] = name.split('of').map((element) => element.trim());

            return { name, regions, href };
        }));
    }
}));

// TODO: add skip rules e.g. { 'non-nullable': ['country'], excludeInRegionsName: ['historical', 'ethnographic'] }
async function* parseRegions(countries) {
    for (const country of countries) {
        if (country) {
            console.log(`parsing ${country.name}...`);

            const countryContext = await browser.newContext();
            const countryPage = await countryContext.newPage();
            await countryPage.goto(baseURL + country.href);

            const catalog = await countryPage.$('#mw-subcategories');

            if (catalog) {
                const regions = await Promise.all((await catalog.$$('.mw-category-group')).map(async (category) => {
                    const regex = /[A-Z]/gi;
                    const index = await category.$('h3');

                    if (regex.test(await index.textContent())) {
                        const group = await category.$('ul');

                        return await Promise.all((await group.$$('li')).map(async (element) => {
                            const link = await element.$('a');
                            const href = await link.getAttribute('href');
                            const name = await link.textContent();

                            return { name, href };
                        }));
                    }
                }));

                await countryContext.close();

                yield { ...country, [country.regions]: regions.flat() };
            }
        }
    }
}

for await (const country of parseRegions(countries.flat())) {
    writeFile(`./generated/${country.name}.json`, JSON.stringify(country));
}

await browser.close();