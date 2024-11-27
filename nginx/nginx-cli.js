#!/usr/bin/env node

import { program } from "commander";
import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";

program
  .version("1.0.0")
  .description(
    "CLI tool for managing Nginx configurations and SSL certificates"
  );

program
  .command("add-site")
  .description("Add a new site to Nginx with SSL")
  .option("-m, --metadata <path>", "Path to the metadata.json file")
  .option("--no-ssl", "Skip SSL configuration")
  .option("--no-domain", "Skip domain configuration (use IP address)")
  .action(addSite);

program
  .command("remove-site")
  .description("Remove a site from Nginx")
  .option("-d, --domain <domain>", "Domain name to remove")
  .action(removeSite);

program
  .command("list-sites")
  .description("Display all active sites and their configurations")
  .action(listSites);

program.parse(process.argv);

async function ensureNginxInstalled() {
  try {
    execSync("which nginx", { stdio: "ignore" });
    console.log("Nginx is already installed.");
  } catch (error) {
    console.log("Nginx is not installed. Installing Nginx...");
    try {
      execSync("sudo apt-get update", { stdio: "inherit" });
      execSync("sudo apt-get install -y nginx", { stdio: "inherit" });
      console.log("Nginx installed successfully.");
    } catch (installError) {
      console.error("Failed to install Nginx:", installError.message);
      process.exit(1);
    }
  }
}

async function addSite(options) {
  await ensureNginxInstalled();

  let metadata;
  if (options.metadata) {
    metadata = await fs.readJson(options.metadata);
  } else {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "metadataPath",
        message: "Enter the path to the metadata.json file:",
      },
    ]);
    metadata = await fs.readJson(answer.metadataPath);
  }

  const { domain, frontendPort, backendPort } = metadata;
  const useDomain = options.domain !== false;
  const useSSL = options.ssl !== false;

  // Generate Nginx configuration
  const nginxConfig = generateNginxConfig(
    domain,
    frontendPort,
    backendPort,
    useDomain,
    useSSL
  );
  const configName = useDomain ? domain : `site_${frontendPort}_${backendPort}`;
  const nginxConfigPath = `/etc/nginx/sites-available/${configName}`;
  await fs.outputFile(nginxConfigPath, nginxConfig);

  // Create symlink to sites-enabled
  const nginxEnabledPath = `/etc/nginx/sites-enabled/${configName}`;
  await fs.ensureSymlink(nginxConfigPath, nginxEnabledPath);

  // Obtain SSL certificate if using domain and SSL
  if (useDomain && useSSL) {
    await obtainSSLCertificate(domain);
  }

  // Reload Nginx
  await reloadNginx();

  console.log(`Site ${configName} added successfully!`);
}

async function removeSite(options) {
  await ensureNginxInstalled();

  let domain;
  if (options.domain) {
    domain = options.domain;
  } else {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "domain",
        message: "Enter the domain name to remove:",
      },
    ]);
    domain = answer.domain;
  }

  // Remove Nginx configuration
  await fs.remove(`/etc/nginx/sites-available/${domain}`);
  await fs.remove(`/etc/nginx/sites-enabled/${domain}`);

  // Reload Nginx
  await reloadNginx();

  console.log(`Site ${domain} removed successfully!`);
}

async function listSites() {
  await ensureNginxInstalled();

  const sitesAvailable = await fs.readdir("/etc/nginx/sites-available");
  const sitesEnabled = await fs.readdir("/etc/nginx/sites-enabled");

  console.log("Active sites:");
  for (const site of sitesEnabled) {
    console.log(`- ${site} (enabled)`);
  }

  console.log("\nAvailable sites:");
  for (const site of sitesAvailable) {
    if (!sitesEnabled.includes(site)) {
      console.log(`- ${site} (disabled)`);
    }
  }
}

function generateNginxConfig(
  domain,
  frontendPort,
  backendPort,
  useDomain,
  useSSL
) {
  let config = `
server {
    ${useDomain ? `server_name ${domain};` : ""}

    location / {
        proxy_pass http://localhost:${frontendPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:${backendPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
`;

  if (useSSL) {
    config += `
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
`;
  } else {
    config += `
    listen 80;
`;
  }

  config += `
}
`;

  if (useDomain && useSSL) {
    config += `
server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}
`;
  }

  return config;
}

async function obtainSSLCertificate(domain) {
  try {
    console.log(`Obtaining SSL certificate for ${domain}...`);
    execSync(
      `certbot --nginx -d ${domain} --non-interactive --agree-tos --email admin@${domain}`,
      { stdio: "inherit" }
    );
    console.log("SSL certificate obtained successfully.");
  } catch (error) {
    console.error("Error obtaining SSL certificate:", error.message);
  }
}

async function reloadNginx() {
  try {
    console.log("Reloading Nginx...");
    execSync("nginx -s reload", { stdio: "inherit" });
    console.log("Nginx reloaded successfully.");
  } catch (error) {
    console.error("Error reloading Nginx:", error.message);
  }
}
