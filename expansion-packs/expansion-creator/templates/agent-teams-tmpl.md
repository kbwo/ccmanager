# Agent Team Configuration Template

[[LLM: This template is for creating agent team configurations in YAML format. Follow the structure carefully and replace all placeholders with appropriate values. The team name should reflect the team's purpose and domain focus.]]

```yaml
bundle:
  name: {{team-display-name}}
  [[LLM: Use format "Team [Descriptor]" for generic teams or "[Domain] Team" for specialized teams. Examples: "Team Fullstack", "Healthcare Team", "Legal Team"]]

  icon: {{team-emoji}}
  [[LLM: Choose a single emoji that best represents the team's function or name]]

  description: {{team-description}}
  [[LLM: Write a concise description (1 sentence) that explains:
  1. The team's primary purpose
  2. What types of projects they handle
  3. Any special capabilities or focus areas
  4. Keep it short as its displayed in menus
  Example: "Full Stack Ideation Web App Team." or "Startup Business Coaching team"]]

agents:
  [[LLM: List the agents that make up this team. Guidelines:
  - Use shortened agent names (e.g., 'analyst' not 'business-analyst')
  - Include 'bmad-orchestrator' for bmad-core teams as the coordinator
  - Only use '*' for an all-inclusive team (rare)
  - Order agents logically by workflow (analysis → design → development → testing)
  - For expansion packs, include both core agents and custom agents]]

  ^^CONDITION: standard-team^^
  # Core workflow agents
  - bmad-orchestrator  # Team coordinator
  - analyst            # Requirements and analysis
  - pm                 # Product management
  - architect          # System design
  - dev                # Development
  - qa                 # Quality assurance
  ^^/CONDITION: standard-team^^

  ^^CONDITION: minimal-team^^
  # Minimal team for quick iterations
  - bmad-orchestrator  # Team coordinator
  - architect          # Design and planning
  - dev                # Implementation
  ^^/CONDITION: minimal-team^^

  ^^CONDITION: specialized-team^^
  # Domain-specific team composition
  - {{domain}}-orchestrator  # Domain coordinator
  <<REPEAT section="specialist-agents" count="{{agent-count}}">>
  - {{agent-short-name}}     # {{agent-role-description}}
  <</REPEAT>>
  ^^/CONDITION: specialized-team^^

  ^^CONDITION: include-all-agents^^
  - '*'  # Include all available agents
  ^^/CONDITION: include-all-agents^^

workflows:
  [[LLM: Define the workflows this team can execute that will guide the user through a multi-step multi agent process. Guidelines:
  - Use null if the team doesn't have predefined workflows
  - Workflow names should be descriptive
  - use domain-specific workflow names]]

  ^^CONDITION: no-workflows^^
  null  # No predefined workflows
  ^^/CONDITION: no-workflows^^

  ^^CONDITION: standard-workflows^^
  # New project workflows
  - greenfield-fullstack  # New full-stack application
  - greenfield-service    # New backend service
  - greenfield-ui         # New frontend application

  # Existing project workflows
  - brownfield-fullstack  # Enhance existing full-stack app
  - brownfield-service    # Enhance existing service
  - brownfield-ui         # Enhance existing UI
  ^^/CONDITION: standard-workflows^^

  ^^CONDITION: domain-workflows^^
  # Domain-specific workflows
  <<REPEAT section="workflows" count="{{workflow-count}}">>
  - {{workflow-name}}  # {{workflow-description}}
  <</REPEAT>>
  ^^/CONDITION: domain-workflows^^
```text

@{example-1: Standard fullstack team}

```yaml
bundle:
  name: Team Fullstack
  icon: 🚀
  description: Complete agile team for full-stack web applications. Handles everything from requirements to deployment.
agents:
  - bmad-orchestrator
  - analyst
  - pm
  - architect
  - dev
  - qa
  - ux-expert
workflows:
  - greenfield-fullstack
  - greenfield-service
  - greenfield-ui
  - brownfield-fullstack
  - brownfield-service
  - brownfield-ui
```

@{example-2: Healthcare expansion pack team}

```yaml
bundle:
  name: Healthcare Compliance Team
  icon: ⚕️
  description: Specialized team for healthcare applications with HIPAA compliance focus. Manages clinical workflows and regulatory requirements.
agents:
  - healthcare-orchestrator
  - clinical-analyst
  - compliance-officer
  - architect
  - dev
  - qa
workflows:
  - healthcare-patient-portal
  - healthcare-compliance-audit
  - clinical-trial-management
```text

@{example-3: Minimal IDE team}

```yaml
bundle:
  name: Team IDE Minimal
  icon: ⚡
  description: Minimal team for IDE usage. Just the essentials for quick development.
agents:
  - bmad-orchestrator
  - architect
  - dev
workflows: null
```

[[LLM: When creating a new team configuration:

1. Choose the most appropriate condition block based on team type
2. Remove all unused condition blocks
3. Replace all placeholders with actual values
4. Ensure agent names match available agents in the system
5. Verify workflow names match available workflows
6. Save as team-[descriptor].yml or [domain]-team.yml
7. Place in the agent-teams directory of the appropriate location]]
