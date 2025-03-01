<svelte:options accessors={true} />

<script lang="ts">
  import { goto, preloadData } from '$app/navigation';
  import { base } from '$app/paths';
  import { env } from '$env/dynamic/public';
  import CalendarIcon from '@nasa-jpl/stellar/icons/calendar.svg?component';
  import ChevronDownIcon from '@nasa-jpl/stellar/icons/chevron_down.svg?component';
  import GraphQLIcon from '@nasa-jpl/stellar/icons/graphql.svg?component';
  import PlanIcon from '@nasa-jpl/stellar/icons/plan.svg?component';
  import TagIcon from '@nasa-jpl/stellar/icons/tag.svg?component';
  import ArchiveIcon from 'bootstrap-icons/icons/archive.svg?component';
  import BarChartIcon from 'bootstrap-icons/icons/bar-chart.svg?component';
  import BoxArrowRightIcon from 'bootstrap-icons/icons/box-arrow-right.svg?component';
  import BracesAsteriskIcon from 'bootstrap-icons/icons/braces-asterisk.svg?component';
  import CodeSquareIcon from 'bootstrap-icons/icons/code-square.svg?component';
  import DiagramIcon from 'bootstrap-icons/icons/diagram-3.svg?component';
  import InfoCircleIcon from 'bootstrap-icons/icons/info-circle.svg?component';
  import JournalCodeIcon from 'bootstrap-icons/icons/journal-code.svg?component';
  import JournalTextIcon from 'bootstrap-icons/icons/journal-text.svg?component';
  import JournalsIcon from 'bootstrap-icons/icons/journals.svg?component';
  import AerieWordmarkDark from '../../assets/aerie-wordmark-dark.svg?component';
  import type { User } from '../../types/app';
  import { logout } from '../../utilities/login';
  import { showAboutModal } from '../../utilities/modal';
  import Menu from './Menu.svelte';
  import MenuItem from './MenuItem.svelte';

  export let user: User | null = null;

  let appMenu: Menu;
</script>

<div class="app-menu" role="none" on:click|stopPropagation={() => appMenu.toggle()}>
  <div class="app-icon"><AerieWordmarkDark /></div>

  <ChevronDownIcon />

  <Menu bind:this={appMenu}>
    <MenuItem on:click={() => goto(`${base}/plans`)} on:pointerenter={() => preloadData(`${base}/plans`)}>
      <PlanIcon />
      Plans
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/models`)} on:pointerenter={() => preloadData(`${base}/models`)}>
      <BarChartIcon />
      Models
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/constraints`)} on:pointerenter={() => preloadData(`${base}/constraints`)}>
      <BracesAsteriskIcon />
      Constraints
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/dictionaries`)} on:pointerenter={() => preloadData(`${base}/dictionaries`)}>
      <JournalTextIcon />
      Dictionaries
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/parcels`)} on:pointerenter={() => preloadData(`${base}/parcels`)}>
      <ArchiveIcon />
      Parcels
    </MenuItem>
    <MenuItem
      on:click={() => goto(`${base}/expansion/rules`)}
      on:pointerenter={() => preloadData(`${base}/expansion/rules`)}
    >
      <CodeSquareIcon />
      Expansion
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/scheduling`)} on:pointerenter={() => preloadData(`${base}/scheduling`)}>
      <CalendarIcon />
      Scheduling
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/sequencing`)} on:pointerenter={() => preloadData(`${base}/sequencing`)}>
      <JournalCodeIcon />
      Sequencing
    </MenuItem>
    <MenuItem on:click={() => goto(`${base}/tags`)} on:pointerenter={() => preloadData(`${base}/tags`)}>
      <TagIcon />
      Tags
    </MenuItem>
    <MenuItem on:click={() => window.open(env.PUBLIC_GATEWAY_CLIENT_URL, '_newtab')}>
      <DiagramIcon />
      Gateway
    </MenuItem>
    <MenuItem on:click={() => window.open(`${env.PUBLIC_GATEWAY_CLIENT_URL}/api-playground`, '_newtab')}>
      <GraphQLIcon />
      GraphQL Playground
    </MenuItem>
    <MenuItem on:click={() => window.open('https://nasa-ammos.github.io/aerie-docs/', '_newtab')}>
      <JournalsIcon />
      Documentation
    </MenuItem>
    <MenuItem on:click={() => logout()}>
      <BoxArrowRightIcon />
      Logout
    </MenuItem>
    <MenuItem on:click={() => showAboutModal()}>
      <InfoCircleIcon />
      About
    </MenuItem>
    <!-- Render user display as a button to intercept click events and prevent menu closure on click -->
    <button
      class="st-button tertiary app-menu--user"
      on:click|capture={evt => {
        evt.stopPropagation();
      }}
    >
      <span>
        Logged in as <span class="st-typography-medium">{user?.id || 'Unknown'}</span>
      </span>
    </button>
  </Menu>
</div>

<style>
  .app-menu {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 5px;
    justify-content: center;
    position: relative;
  }

  .app-icon {
    align-items: center;
    display: flex;
    font-size: 24px;
    height: 24px;
    justify-content: center;
    line-height: 24px;
    width: 88px;
  }

  .app-menu--user {
    background: var(--st-gray-10);
    border-top: 1px solid var(--st-gray-15);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    color: var(--st-gray-60);
    cursor: default;
    flex: 1;
    height: auto;
    justify-content: flex-start;
    padding: 8px;
    width: 100%;
  }
</style>
