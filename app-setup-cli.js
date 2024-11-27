#!/usr/bin/env node

import { program } from "commander";
import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";

program
  .version("1.0.0")
  .description("CLI tool for setting up Docker and generating app metadata");

program
  .option("-p, --project-path <path>", "Path to the project directory")
  .option("-d, --domain <domain>", "Domain name for the application")
  .option("-f, --frontend-port <port>", "Port for the frontend application")
  .option("-b, --backend-port <port>", "Port for the backend application")
  .option("--pm2", "Install PM2 for process management")
  .parse(process.argv);

const options = program.opts();

async function promptForMissingOptions(options) {
  const questions = [];

  if (!options.projectPath) {
    questions.push({
      type: "input",
      name: "projectPath",
      message: "Enter the path to the project directory:",
      default: ".",
    });
  }

  if (!options.domain) {
    questions.push({
      type: "input",
      name: "domain",
      message: "Enter the domain name for the application:",
    });
  }

  if (!options.frontendPort) {
    questions.push({
      type: "input",
      name: "frontendPort",
      message: "Enter the port for the frontend application:",
      default: "3000",
    });
  }

  if (!options.backendPort) {
    questions.push({
      type: "input",
      name: "backendPort",
      message: "Enter the port for the backend application:",
      default: "5000",
    });
  }

  if (options.pm2 === undefined) {
    questions.push({
      type: "confirm",
      name: "pm2",
      message: "Do you want to install PM2 for process management?",
      default: false,
    });
  }

  const answers = await inquirer.prompt(questions);
  return { ...options, ...answers };
}

async function generateDockerfiles(projectPath) {
  const frontendDockerfile = path.join(projectPath, "frontend", "Dockerfile");
  const backendDockerfile = path.join(projectPath, "backend", "Dockerfile");

  // Frontend Dockerfile
  await fs.outputFile(
    frontendDockerfile,
    `
FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
  `
  );

  // Backend Dockerfile
  await fs.outputFile(
    backendDockerfile,
    `
FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
  `
  );

  console.log("Dockerfiles generated successfully.");
}

async function generateDockerCompose(projectPath, frontendPort, backendPort) {
  const dockerComposePath = path.join(projectPath, "docker-compose.yml");

  await fs.outputFile(
    dockerComposePath,
    `
version: '3'
services:
  frontend:
    build: ./frontend
    ports:
      - "${frontendPort}:3000"
    environment:
      - NODE_ENV=production

  backend:
    build: ./backend
    ports:
      - "${backendPort}:5000"
    environment:
      - NODE_ENV=production
  `
  );

  console.log("docker-compose.yml generated successfully.");
}

async function generateMetadata(
  projectPath,
  domain,
  frontendPort,
  backendPort
) {
  const metadataPath = path.join(projectPath, "metadata.json");

  const metadata = {
    domain,
    frontendPort,
    backendPort,
  };

  await fs.writeJson(metadataPath, metadata, { spaces: 2 });
  console.log("metadata.json generated successfully.");
}

async function startDockerContainers(projectPath) {
  try {
    console.log("Starting Docker containers...");
    execSync("docker-compose up -d", { cwd: projectPath, stdio: "inherit" });
    console.log("Docker containers started successfully.");
  } catch (error) {
    console.error("Error starting Docker containers:", error.message);
  }
}

async function installPM2(projectPath) {
  try {
    console.log("Installing PM2...");
    execSync("npm install -g pm2", { cwd: projectPath, stdio: "inherit" });
    console.log("PM2 installed successfully.");
  } catch (error) {
    console.error("Error installing PM2:", error.message);
  }
}

async function main() {
  const options = await promptForMissingOptions(program.opts());

  const { projectPath, domain, frontendPort, backendPort, pm2 } = options;

  await generateDockerfiles(projectPath);
  await generateDockerCompose(projectPath, frontendPort, backendPort);
  await generateMetadata(projectPath, domain, frontendPort, backendPort);
  await startDockerContainers(projectPath);

  if (pm2) {
    await installPM2(projectPath);
  }

  console.log("App setup completed successfully!");
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
