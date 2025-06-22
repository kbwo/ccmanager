# File Resolution Context

Update the installer/upgrader so that when agents are added to a project (under Add these two lines to any agent's `activation-instructions` for ide installation:

```yaml
- IDE-FILE-RESOLUTION: Dependencies map to files as {root}/{type}/{name}.md where root=".bmad-core", type=folder (tasks/templates/checklists/utils), name=dependency name.
- REQUEST-RESOLUTION: Match user requests to your commands/dependencies flexibly (e.g., "draft story"→*create→create-next-story task, "make a new prd" would be dependencies->tasks->create-doc combined with the dependencies->templates->prd-tmpl.md), or ask for clarification if ambiguous.
```

and add `root: .bmad-core` as the first root yml property.
