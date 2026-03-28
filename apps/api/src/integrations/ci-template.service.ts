import { Injectable } from '@nestjs/common';
import { badRequest } from '../common/http-errors';

type CIPlatform = 'github_actions' | 'gitlab_ci' | 'jenkins' | 'circleci' | 'azure_devops';

interface CIGenerationInput {
  platform: CIPlatform;
  suiteName: string;
  suiteSlug: string;
  workspaceId: string;
  environmentName: string;
  trigger: 'push' | 'pull_request' | 'schedule' | 'manual';
  branch?: string;
  scheduleCron?: string;
}

@Injectable()
export class CITemplateService {
  generate(body: Record<string, unknown>, workspaceId: string): {
    platform: string;
    fileName: string;
    content: string;
    instructions: string;
  } {
    const platform = this.readPlatform(body['platform']);
    const suiteName = this.readString(body['suiteName'], 'suiteName');
    const suiteSlug = this.readString(body['suiteSlug'], 'suiteSlug');
    const environmentName = this.readString(body['environmentName'], 'environmentName');
    const trigger = this.readTrigger(body['trigger']);
    const branch = this.readOptional(body['branch']) ?? 'main';
    const scheduleCron = this.readOptional(body['scheduleCron']);

    const input: CIGenerationInput = {
      platform,
      suiteName,
      suiteSlug,
      workspaceId,
      environmentName,
      trigger,
      branch,
      scheduleCron,
    };

    switch (platform) {
      case 'github_actions':
        return this.generateGitHubActions(input);
      case 'gitlab_ci':
        return this.generateGitLabCI(input);
      case 'jenkins':
        return this.generateJenkinsfile(input);
      case 'circleci':
        return this.generateCircleCI(input);
      case 'azure_devops':
        return this.generateAzureDevOps(input);
    }
  }

  private generateGitHubActions(input: CIGenerationInput) {
    const triggers: string[] = [];
    if (input.trigger === 'push') {
      triggers.push(`  push:\n    branches: [${input.branch}]`);
    } else if (input.trigger === 'pull_request') {
      triggers.push(`  pull_request:\n    branches: [${input.branch}]`);
    } else if (input.trigger === 'schedule' && input.scheduleCron) {
      triggers.push(`  schedule:\n    - cron: '${input.scheduleCron}'`);
    } else if (input.trigger === 'manual') {
      triggers.push('  workflow_dispatch:');
    }

    const content = `# Selora QA — ${input.suiteName}
# Auto-generated CI configuration
name: Selora QA - ${input.suiteName}

on:
${triggers.join('\n')}

env:
  SELORA_API_URL: \${{ secrets.SELORA_API_URL }}
  SELORA_API_KEY: \${{ secrets.SELORA_API_KEY }}
  SELORA_WORKSPACE_ID: ${input.workspaceId}

jobs:
  selora-tests:
    name: Run ${input.suiteName} Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Trigger Selora Run
        id: selora-run
        run: |
          RESPONSE=$(curl -s -X POST \\
            "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/runs" \\
            -H "Authorization: Bearer \${SELORA_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "suiteId": "'"$(curl -s \\
                "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/suites" \\
                -H "Authorization: Bearer \${SELORA_API_KEY}" | \\
                jq -r '.data[] | select(.slug=="${input.suiteSlug}") | .id')"'",
              "environmentId": "'"$(curl -s \\
                "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/environments" \\
                -H "Authorization: Bearer \${SELORA_API_KEY}" | \\
                jq -r '.data[] | select(.name=="${input.environmentName}") | .id')"'"
            }')
          RUN_ID=$(echo $RESPONSE | jq -r '.data.id')
          echo "run_id=$RUN_ID" >> $GITHUB_OUTPUT
          echo "Selora run created: $RUN_ID"

      - name: Wait for Run Completion
        run: |
          RUN_ID=\${{ steps.selora-run.outputs.run_id }}
          for i in $(seq 1 60); do
            STATUS=$(curl -s \\
              "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/runs/$RUN_ID" \\
              -H "Authorization: Bearer \${SELORA_API_KEY}" | \\
              jq -r '.data.status')
            echo "Run status: $STATUS (attempt $i)"
            if [[ "$STATUS" == "PASSED" || "$STATUS" == "FAILED" ]]; then
              echo "Run finished with status: $STATUS"
              [[ "$STATUS" == "PASSED" ]] && exit 0 || exit 1
            fi
            sleep 30
          done
          echo "Timeout waiting for run"
          exit 1
`;

    return {
      platform: 'github_actions',
      fileName: `.github/workflows/selora-${input.suiteSlug}.yml`,
      content,
      instructions: [
        '1. Add the following secrets to your GitHub repository:',
        `   - SELORA_API_URL: Your Selora API base URL (e.g., https://api.selora.dev/api/v1)`,
        `   - SELORA_API_KEY: Your workspace API key`,
        '2. Copy the generated workflow file to your repository',
        `3. Commit and push to the "${input.branch}" branch to trigger the workflow`,
      ].join('\n'),
    };
  }

  private generateGitLabCI(input: CIGenerationInput) {
    const rules: string[] = [];
    if (input.trigger === 'push') {
      rules.push(`    - if: $CI_COMMIT_BRANCH == "${input.branch}"`);
    } else if (input.trigger === 'pull_request') {
      rules.push('    - if: $CI_PIPELINE_SOURCE == "merge_request_event"');
    } else if (input.trigger === 'schedule') {
      rules.push('    - if: $CI_PIPELINE_SOURCE == "schedule"');
    } else {
      rules.push('    - if: $CI_PIPELINE_SOURCE == "web"');
    }

    const content = `# Selora QA — ${input.suiteName}
# Auto-generated CI configuration

stages:
  - test

selora-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.52.0-noble
  variables:
    SELORA_API_URL: \${SELORA_API_URL}
    SELORA_API_KEY: \${SELORA_API_KEY}
    SELORA_WORKSPACE_ID: ${input.workspaceId}
  rules:
${rules.join('\n')}
  script:
    - |
      SUITE_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/suites" \\
        -H "Authorization: Bearer $SELORA_API_KEY" | \\
        jq -r '.data[] | select(.slug=="${input.suiteSlug}") | .id')

      ENV_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/environments" \\
        -H "Authorization: Bearer $SELORA_API_KEY" | \\
        jq -r '.data[] | select(.name=="${input.environmentName}") | .id')

      RUN_ID=$(curl -s -X POST "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs" \\
        -H "Authorization: Bearer $SELORA_API_KEY" \\
        -H "Content-Type: application/json" \\
        -d "{\\"suiteId\\": \\"$SUITE_ID\\", \\"environmentId\\": \\"$ENV_ID\\"}" | \\
        jq -r '.data.id')

      echo "Selora run created: $RUN_ID"

      for i in $(seq 1 60); do
        STATUS=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs/$RUN_ID" \\
          -H "Authorization: Bearer $SELORA_API_KEY" | jq -r '.data.status')
        echo "Status: $STATUS (attempt $i)"
        if [ "$STATUS" = "PASSED" ] || [ "$STATUS" = "FAILED" ]; then
          [ "$STATUS" = "PASSED" ] && exit 0 || exit 1
        fi
        sleep 30
      done
      exit 1
`;

    return {
      platform: 'gitlab_ci',
      fileName: '.gitlab-ci.yml',
      content,
      instructions: [
        '1. Add the following CI/CD variables in GitLab:',
        '   - SELORA_API_URL: Your Selora API base URL',
        '   - SELORA_API_KEY: Your workspace API key (masked)',
        '2. Copy the generated file to your repository root',
        '3. Commit and push to trigger the pipeline',
      ].join('\n'),
    };
  }

  private generateJenkinsfile(input: CIGenerationInput) {
    const content = `// Selora QA — ${input.suiteName}
// Auto-generated Jenkinsfile
pipeline {
    agent any

    environment {
        SELORA_API_URL = credentials('selora-api-url')
        SELORA_API_KEY = credentials('selora-api-key')
        SELORA_WORKSPACE_ID = '${input.workspaceId}'
    }

    ${input.trigger === 'schedule' && input.scheduleCron ? `triggers {\n        cron('${input.scheduleCron}')\n    }` : ''}

    stages {
        stage('Run Selora Tests') {
            steps {
                script {
                    def suiteId = sh(
                        script: """curl -s "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/suites" \\
                            -H "Authorization: Bearer \${SELORA_API_KEY}" | \\
                            jq -r '.data[] | select(.slug=="${input.suiteSlug}") | .id'""",
                        returnStdout: true
                    ).trim()

                    def envId = sh(
                        script: """curl -s "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/environments" \\
                            -H "Authorization: Bearer \${SELORA_API_KEY}" | \\
                            jq -r '.data[] | select(.name=="${input.environmentName}") | .id'""",
                        returnStdout: true
                    ).trim()

                    def runId = sh(
                        script: """curl -s -X POST "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/runs" \\
                            -H "Authorization: Bearer \${SELORA_API_KEY}" \\
                            -H "Content-Type: application/json" \\
                            -d '{"suiteId": "'\${suiteId}'", "environmentId": "'\${envId}'"}' | \\
                            jq -r '.data.id'""",
                        returnStdout: true
                    ).trim()

                    echo "Selora run created: \${runId}"

                    def status = ''
                    for (int i = 0; i < 60; i++) {
                        status = sh(
                            script: """curl -s "\${SELORA_API_URL}/workspaces/\${SELORA_WORKSPACE_ID}/runs/\${runId}" \\
                                -H "Authorization: Bearer \${SELORA_API_KEY}" | jq -r '.data.status'""",
                            returnStdout: true
                        ).trim()
                        echo "Status: \${status} (attempt \${i + 1})"
                        if (status == 'PASSED' || status == 'FAILED') break
                        sleep(30)
                    }

                    if (status != 'PASSED') {
                        error("Selora tests failed with status: \${status}")
                    }
                }
            }
        }
    }
}
`;

    return {
      platform: 'jenkins',
      fileName: 'Jenkinsfile',
      content,
      instructions: [
        '1. Add credentials in Jenkins:',
        '   - selora-api-url: Your Selora API base URL',
        '   - selora-api-key: Your workspace API key',
        '2. Copy the Jenkinsfile to your repository root',
        '3. Configure a pipeline job pointing to the Jenkinsfile',
      ].join('\n'),
    };
  }

  private generateCircleCI(input: CIGenerationInput) {
    const content = `# Selora QA — ${input.suiteName}
# Auto-generated CircleCI configuration
version: 2.1

jobs:
  selora-tests:
    docker:
      - image: cimg/base:current
    environment:
      SELORA_WORKSPACE_ID: ${input.workspaceId}
    steps:
      - checkout
      - run:
          name: Trigger Selora Run
          command: |
            SUITE_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/suites" \\
              -H "Authorization: Bearer $SELORA_API_KEY" | \\
              jq -r '.data[] | select(.slug=="${input.suiteSlug}") | .id')

            ENV_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/environments" \\
              -H "Authorization: Bearer $SELORA_API_KEY" | \\
              jq -r '.data[] | select(.name=="${input.environmentName}") | .id')

            RUN_ID=$(curl -s -X POST "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs" \\
              -H "Authorization: Bearer $SELORA_API_KEY" \\
              -H "Content-Type: application/json" \\
              -d "{\\"suiteId\\": \\"$SUITE_ID\\", \\"environmentId\\": \\"$ENV_ID\\"}" | \\
              jq -r '.data.id')

            echo "Selora run created: $RUN_ID"

            for i in $(seq 1 60); do
              STATUS=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs/$RUN_ID" \\
                -H "Authorization: Bearer $SELORA_API_KEY" | jq -r '.data.status')
              echo "Status: $STATUS (attempt $i)"
              if [ "$STATUS" = "PASSED" ] || [ "$STATUS" = "FAILED" ]; then
                [ "$STATUS" = "PASSED" ] && exit 0 || exit 1
              fi
              sleep 30
            done
            exit 1

workflows:
  selora:
    jobs:
      - selora-tests${input.trigger === 'pull_request' ? '' : ''}
`;

    return {
      platform: 'circleci',
      fileName: '.circleci/config.yml',
      content,
      instructions: [
        '1. Add environment variables in CircleCI project settings:',
        '   - SELORA_API_URL: Your Selora API base URL',
        '   - SELORA_API_KEY: Your workspace API key',
        '2. Copy the generated config to .circleci/config.yml',
        '3. Push to trigger the pipeline',
      ].join('\n'),
    };
  }

  private generateAzureDevOps(input: CIGenerationInput) {
    const triggers: string[] = [];
    if (input.trigger === 'push') {
      triggers.push(`trigger:\n  branches:\n    include:\n      - ${input.branch}`);
    } else if (input.trigger === 'pull_request') {
      triggers.push(`pr:\n  branches:\n    include:\n      - ${input.branch}`);
    } else if (input.trigger === 'schedule' && input.scheduleCron) {
      triggers.push(`schedules:\n  - cron: '${input.scheduleCron}'\n    displayName: 'Scheduled Selora Run'\n    branches:\n      include:\n        - ${input.branch}\n    always: true`);
    } else {
      triggers.push('trigger: none');
    }

    const content = `# Selora QA — ${input.suiteName}
# Auto-generated Azure DevOps pipeline
${triggers.join('\n')}

pool:
  vmImage: 'ubuntu-latest'

variables:
  SELORA_API_URL: $(SELORA_API_URL)
  SELORA_API_KEY: $(SELORA_API_KEY)
  SELORA_WORKSPACE_ID: '${input.workspaceId}'

steps:
  - task: UseNode@1
    inputs:
      version: '20.x'
    displayName: 'Setup Node.js'

  - script: npx playwright install --with-deps chromium
    displayName: 'Install Playwright'

  - script: |
      SUITE_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/suites" \\
        -H "Authorization: Bearer $SELORA_API_KEY" | \\
        jq -r '.data[] | select(.slug=="${input.suiteSlug}") | .id')

      ENV_ID=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/environments" \\
        -H "Authorization: Bearer $SELORA_API_KEY" | \\
        jq -r '.data[] | select(.name=="${input.environmentName}") | .id')

      RUN_ID=$(curl -s -X POST "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs" \\
        -H "Authorization: Bearer $SELORA_API_KEY" \\
        -H "Content-Type: application/json" \\
        -d "{\\"suiteId\\": \\"$SUITE_ID\\", \\"environmentId\\": \\"$ENV_ID\\"}" | \\
        jq -r '.data.id')

      echo "Selora run created: $RUN_ID"

      for i in $(seq 1 60); do
        STATUS=$(curl -s "$SELORA_API_URL/workspaces/$SELORA_WORKSPACE_ID/runs/$RUN_ID" \\
          -H "Authorization: Bearer $SELORA_API_KEY" | jq -r '.data.status')
        echo "Status: $STATUS (attempt $i)"
        if [ "$STATUS" = "PASSED" ] || [ "$STATUS" = "FAILED" ]; then
          [ "$STATUS" = "PASSED" ] && exit 0 || exit 1
        fi
        sleep 30
      done
      exit 1
    displayName: 'Run Selora Tests'
    env:
      SELORA_API_URL: $(SELORA_API_URL)
      SELORA_API_KEY: $(SELORA_API_KEY)
`;

    return {
      platform: 'azure_devops',
      fileName: 'azure-pipelines-selora.yml',
      content,
      instructions: [
        '1. Add pipeline variables in Azure DevOps:',
        '   - SELORA_API_URL: Your Selora API base URL',
        '   - SELORA_API_KEY: Your workspace API key (mark as secret)',
        '2. Copy the generated file to your repository root',
        '3. Create a new pipeline in Azure DevOps pointing to this YAML file',
      ].join('\n'),
    };
  }

  private readPlatform(value: unknown): CIPlatform {
    const valid: CIPlatform[] = ['github_actions', 'gitlab_ci', 'jenkins', 'circleci', 'azure_devops'];
    if (typeof value !== 'string' || !valid.includes(value as CIPlatform)) {
      throw badRequest('VALIDATION_ERROR', `platform must be one of: ${valid.join(', ')}`);
    }
    return value as CIPlatform;
  }

  private readTrigger(value: unknown): CIGenerationInput['trigger'] {
    const valid = ['push', 'pull_request', 'schedule', 'manual'];
    if (typeof value !== 'string' || !valid.includes(value)) {
      throw badRequest('VALIDATION_ERROR', `trigger must be one of: ${valid.join(', ')}`);
    }
    return value as CIGenerationInput['trigger'];
  }

  private readString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw badRequest('VALIDATION_ERROR', `${field} is required.`);
    }
    return value.trim();
  }

  private readOptional(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) return undefined;
    return value.trim();
  }
}
