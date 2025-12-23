---
description: Perform a code review
---

# Code Review Workflow

## Overview
When asked to "review" code, read the code and provide review feedback. Do not implement changes unless explicitly asked. Write the code review as markdown to `.reviews/BRANCH_NAME.md`.

## Steps

### 1. Create a Task List
- Maintain a detailed checklist based on the review request
- Format as: `- [ ]` (incomplete) or `- [x]` (complete)
- Update as you progress through the review

### 2. Gather Context
- Read the relevant files and understand the codebase structure
- Check for repository-specific guidelines (e.g., CLAUDE.md, CONTRIBUTING.md)
- Identify the scope of changes to review

### 3. Understand the Request
- Determine if this is a general review or focused on specific concerns
- Classify the type: bug fix, feature, refactor, etc.
- Note any specific areas the requester wants feedback on

### 4. Perform the Review

#### A. Code Quality
- [ ] Look for bugs and logic errors
- [ ] Check for security vulnerabilities
- [ ] Identify performance problems
- [ ] Verify error handling is appropriate

#### B. Best Practices
- [ ] Check adherence to coding standards
- [ ] Verify naming conventions are followed
- [ ] Ensure proper documentation/comments exist
- [ ] Look for code duplication

#### C. Maintainability
- [ ] Assess readability and clarity
- [ ] Check for proper separation of concerns
- [ ] Verify test coverage for changes
- [ ] Look for overly complex logic that could be simplified

#### D. Architecture
- [ ] Verify changes align with existing patterns
- [ ] Check for proper abstraction levels
- [ ] Identify any breaking changes
- [ ] Consider scalability implications

### 5. Provide Feedback

Format your review with:
- **Specific file paths and line numbers** for each comment
- **Severity levels**: Critical, Major, Minor, Suggestion
- **Code examples** when suggesting alternatives
- **Rationale** explaining why something should change

Example format:
```
## Critical Issues
- `path/to/file.ts#L42-L45`: Description of issue and suggested fix

## Suggestions
- `path/to/file.ts#L100`: Consider using X instead of Y because...
```

### 6. Summary
- Provide an overall assessment
- List any blocking issues that must be addressed
- Note positive aspects of the code
- Recommend approval, changes requested, or further discussion needed