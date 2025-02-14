import test, { expect, type BrowserContext, type Page } from '@playwright/test';
import { Constraints } from '../fixtures/Constraints.js';
import { Models } from '../fixtures/Models.js';
import { PanelNames, Plan } from '../fixtures/Plan.js';
import { Plans } from '../fixtures/Plans.js';
import { SchedulingConditions } from '../fixtures/SchedulingConditions.js';
import { SchedulingGoals } from '../fixtures/SchedulingGoals.js';
import { User, performLogin } from '../fixtures/User.js';

let constraints: Constraints;
let context: BrowserContext;
let models: Models;
let page: Page;
let planA: Plan;
let planB: Plan;
let plans: Plans;
let schedulingConditions: SchedulingConditions;
let schedulingGoals: SchedulingGoals;
let userA: User;
let userB: User;

test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext();
  page = await context.newPage();

  userA = new User(page, 'userA');
  userB = new User(page, 'userB');
  models = new Models(page);
  plans = new Plans(page, models);
  constraints = new Constraints(page);
  schedulingConditions = new SchedulingConditions(page);
  schedulingGoals = new SchedulingGoals(page);
  planA = new Plan(page, plans, constraints, schedulingGoals, schedulingConditions, plans.createPlanName());
  planB = new Plan(page, plans, constraints, schedulingGoals, schedulingConditions, plans.createPlanName());

  await models.goto();
  await models.createModel(baseURL);
  await userB.logout(baseURL);
  // TODO find a way to delete these test users. Cannot import the reqHasura into playwright due
  // to svelte runtime libraries that there is no solution or mock for as of 4/3/24.
  // see https://github.com/microsoft/playwright/issues/18825#issuecomment-1421523694
  await userB.login(baseURL);
  await userA.logout(baseURL);
  await userA.login(baseURL);

  await plans.goto();

  const planAId = await plans.createPlan(planA.planName);
  await plans.filterTable(planA.planName);
  await expect(plans.table.getByRole('row', { name: planA.planName })).toBeVisible();

  await plans.createPlan(planB.planName);
  await planA.goto(planAId);
});

test.afterAll(async ({ baseURL }) => {
  await plans.goto();
  await userA.switchRole('aerie_admin');
  await plans.deletePlan(planA.planName);
  await plans.deletePlan(planB.planName);
  await models.goto();
  await models.deleteModel();
  await userA.logout(baseURL);
  await performLogin(page, baseURL);
  await page.close();
  await context.close();
});

test.describe.serial('Plan Metadata', () => {
  test('Plan should be re-nameable', async () => {
    await planA.showPanel(PanelNames.PLAN_METADATA, true);
    await planA.renamePlan(planA.planName + '_renamed');

    // Give the input form a moment to react before immediately performing another rename
    await expect(planA.planNameInput).toHaveValue(planA.planName + '_renamed');
    await planA.renamePlan(planA.planName);
  });

  test('Plan name uniqueness validation enforced', async () => {
    await planA.showPanel(PanelNames.PLAN_METADATA, true);
    await planA.fillPlanName(planB.planName);
    await expect(page.locator('.error:has-text("Plan name already exists")')).toBeDefined();
  });

  test('Plan owner should be userA', async () => {
    await planA.showPanel(PanelNames.PLAN_METADATA, true);
    await expect(planA.panelPlanMetadata.locator('input[name="owner"]')).toHaveValue(userA.username);
  });

  test('userA can be added as a plan collaborator to their own plan', async () => {
    await planA.addPlanCollaborator(userA.username);
  });

  test('userA can be removed as a plan collaborator', async () => {
    await planA.removePlanCollaborator(userA.username);
  });

  test(`Non-collaborator userB as role user should not be able to edit userA's plan collaborators`, async ({
    baseURL,
  }) => {
    await userA.logout(baseURL);
    await userB.login(baseURL);

    await plans.goto();
    const planAId = await plans.getPlanId(planA.planName);
    await planA.goto(planAId);

    await userB.switchRole('user');
    await planA.showPanel(PanelNames.PLAN_METADATA, true);
    await expect(planA.planCollaboratorInputContainer.locator('.tags-input')).toHaveAttribute('readonly', 'readonly');
  });

  test(`userB can be added as a plan collaborator to userA's plan`, async ({ baseURL }) => {
    await userB.logout(baseURL);
    await userA.login(baseURL);

    await plans.goto();
    const planAId = await plans.getPlanId(planA.planName);
    await planA.goto(planAId);

    await planA.addPlanCollaborator(userB.username);
  });

  test(`Collaborator userB in "user" role should be able to edit userA's plan collaborators`, async ({ baseURL }) => {
    await userA.logout(baseURL);
    await userB.login(baseURL);

    await plans.goto();
    const planAId = await plans.getPlanId(planA.planName);
    await planA.goto(planAId);

    await userB.switchRole('user');
    await planA.showPanel(PanelNames.PLAN_METADATA, true);
    await planA.addPlanCollaborator(userA.username);
  });

  test(`Sets of collaborators can be added from other plans`, async ({ baseURL }) => {
    await userB.logout(baseURL);
    await userA.login(baseURL);

    await plans.goto();
    const planBId = await plans.getPlanId(planB.planName);
    await planB.goto(planBId);

    await planB.showPanel(PanelNames.PLAN_METADATA, true);

    // Wait for plan to be an option in the input (via socket update which can take at least half a second)
    await page.waitForTimeout(1000);
    await planB.addPlanCollaborator(planA.planName, false);
    await expect(
      planB.planCollaboratorInputContainer
        .locator('.tags-input-selected-items')
        .getByRole('option', { name: userA.username }),
    ).toBeDefined();
    await expect(
      planB.planCollaboratorInputContainer
        .locator('.tags-input-selected-items')
        .getByRole('option', { name: userB.username }),
    ).toBeDefined();
  });
});
