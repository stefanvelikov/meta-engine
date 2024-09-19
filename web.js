const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');

const processingDomain = 'https://agota-studio.webflow.io';
const sitemapRealDomain = 'https://agota.studio';
const sitemapUrl = `${processingDomain}/sitemap.xml`;
const outputFolder = 'website';
const sitemapFileName = 'sitemap.xml';

async function clearFolder(folderPath, excludeFiles = []) {
  try {
    const files = await fs.readdir(folderPath);

    for (const file of files) {
      if (!excludeFiles.includes(file)) {
        const filePath = path.join(folderPath, file);
        if (await isDirectory(filePath)) {
          await clearFolder(filePath, excludeFiles);
          await fs.rmdir(filePath);
        } else {
          await fs.unlink(filePath);
        }
      }
    }
  } catch (error) {
    console.error(`Error clearing folder ${folderPath}:`, error.message);
  }
}

async function fetchSitemap() {
  try {
    await clearFolder(outputFolder, [`.htaccess`, sitemapFileName]);

    const response = await axios.get(sitemapUrl);
    const parser = new xml2js.Parser();
    const sitemapObj = await parser.parseStringPromise(response.data);

    // Process sitemap URLs
    const urls = sitemapObj.urlset.url.map(url => {
      let trimmedUrl = url.loc[0].trim();
      // Replace webflow.io domain with agota.studio
      if (trimmedUrl.includes(processingDomain)) {
        trimmedUrl = trimmedUrl.replace(processingDomain, sitemapRealDomain);
      }
      return { loc: [trimmedUrl] };
    });

    await fs.mkdir(outputFolder, { recursive: true });

    const updatedSitemapObj = {
      ...sitemapObj,
      urlset: {
        ...sitemapObj.urlset,
        url: urls,
      },
    };

    const builder = new xml2js.Builder();
    const updatedSitemapXml = builder.buildObject(updatedSitemapObj);

    const sitemapFilePath = path.join(outputFolder, sitemapFileName);
    await fs.writeFile(sitemapFilePath, updatedSitemapXml);

    console.log(`Updated sitemap saved to ${sitemapFilePath}`);

    // Proceed to fetch and save content for each URL in the sitemap
    for (const url of urls) {
      try {
        const pageContent = await axios.get(url.loc[0]);
        const dom = new JSDOM(pageContent.data);
        const hasFormTag = dom.window.document.querySelector('form');

        let cleanedContent = pageContent.data;

        if (!hasFormTag) {
          cleanedContent = cleanedContent.replace(/data-wf-domain="[^"]*"/g, '')
            .replace(/data-wf-page="[^"]*"/g, '')
            .replace(/data-wf-site="[^"]*"/g, '');
        }

        const parsedUrl = new URL(url.loc[0]);
        const pathSegments = parsedUrl.pathname.split('/').filter(segment => segment);

        let currentFolderPath = outputFolder;
        for (let i = 0; i < pathSegments.length - 1; i++) {
          const segment = pathSegments[i];
          currentFolderPath = path.join(currentFolderPath, segment);
          await fs.mkdir(currentFolderPath, { recursive: true });
        }

        let fileName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] + '.html' : 'index.html';
        const filePath = path.join(currentFolderPath, fileName);

        if (await isDirectory(filePath)) {
          fileName = 'index.html';
        }

        await fs.writeFile(filePath, cleanedContent);

        console.log(`Content for ${url.loc[0]} fetched and saved to ${filePath}`);
      } catch (error) {
        console.error(`Error fetching content for ${url.loc[0]}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error fetching or processing sitemap:', error.message);
  }
}


async function isDirectory(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch (error) {
    return false;
  }
}

fetchSitemap();


async function fetchResourceLinksAndUpdateSitemap() {
  const resourcePageUrl = `${processingDomain}/resources`;
  
  try {
    // Fetch the resources page
    const resourcePageContent = await axios.get(resourcePageUrl);
    const dom = new JSDOM(resourcePageContent.data);

    // Find all elements with the class .layout394_card.is-link
    const linkElements = dom.window.document.querySelectorAll('.layout394_card.is-link');
    const resourceLinks = Array.from(linkElements).map(el => el.href);

    // Debugging: Log the found links to check if they are being fetched correctly
    console.log('Found resource links:', resourceLinks);

    // Fetch the sitemap
    const response = await axios.get(sitemapUrl);
    const parser = new xml2js.Parser();
    const sitemapObj = await parser.parseStringPromise(response.data);

    // Add the resource links to the sitemap if they are not already present
    resourceLinks.forEach(link => {
      const fullUrl = `${sitemapRealDomain}${link}`;
      if (!sitemapObj.urlset.url.some(urlObj => urlObj.loc[0] === fullUrl)) {
        // Add link to sitemap
        sitemapObj.urlset.url.push({ loc: [fullUrl] });
        console.log(`Adding ${fullUrl} to sitemap.`);
      }
    });

    // Rebuild and save the updated sitemap
    const builder = new xml2js.Builder();
    const updatedSitemapXml = builder.buildObject(sitemapObj);
    const sitemapFilePath = path.join(outputFolder, sitemapFileName);
    await fs.writeFile(sitemapFilePath, updatedSitemapXml);

    console.log(`Updated sitemap with resource links saved to ${sitemapFilePath}`);
  } catch (error) {
    console.error('Error fetching or processing resources page:', error.message);
  }
}

// Ensure this function is called after fetching and processing the sitemap
fetchResourceLinksAndUpdateSitemap();
