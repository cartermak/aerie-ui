<svelte:options immutable={true} />

<script lang="ts">
  import { indentSelection } from '@codemirror/commands';
  import { json } from '@codemirror/lang-json';
  import { indentService, syntaxTree } from '@codemirror/language';
  import { lintGutter } from '@codemirror/lint';
  import { Compartment, EditorState, Prec } from '@codemirror/state';
  import { Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
  import type { SyntaxNode } from '@lezer/common';
  import type { ChannelDictionary, CommandDictionary, ParameterDictionary } from '@nasa-jpl/aerie-ampcs';
  import ChevronDownIcon from '@nasa-jpl/stellar/icons/chevron_down.svg?component';
  import CollapseIcon from 'bootstrap-icons/icons/arrow-bar-down.svg?component';
  import ExpandIcon from 'bootstrap-icons/icons/arrow-bar-up.svg?component';
  import ClipboardIcon from 'bootstrap-icons/icons/clipboard.svg?component';
  import DownloadIcon from 'bootstrap-icons/icons/download.svg?component';
  import { EditorView, basicSetup } from 'codemirror';
  import { debounce } from 'lodash-es';
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { TOKEN_COMMAND } from '../../constants/seq-n-grammar-constants';
  import {
    inputFormat,
    outputFormat,
    sequenceAdaptation,
    setSequenceAdaptation,
  } from '../../stores/sequence-adaptation';
  import {
    channelDictionaries,
    commandDictionaries,
    getParsedChannelDictionary,
    getParsedCommandDictionary,
    getParsedParameterDictionary,
    parameterDictionaries as parameterDictionariesStore,
    parcelToParameterDictionaries,
    userSequenceEditorColumns,
    userSequenceEditorColumnsWithFormBuilder,
  } from '../../stores/sequencing';
  import type { User } from '../../types/app';
  import type { IOutputFormat, Parcel } from '../../types/sequencing';
  import { setupLanguageSupport } from '../../utilities/codemirror';
  import { computeBlocks, isBlockCommand } from '../../utilities/codemirror/custom-folder';
  import effects from '../../utilities/effects';
  import { downloadBlob, downloadJSON } from '../../utilities/generic';
  import { inputLinter, outputLinter } from '../../utilities/sequence-editor/extension-points';
  import { sequenceTooltip } from '../../utilities/sequence-editor/sequence-tooltip';
  import { getNearestAncestorNodeOfType } from '../../utilities/sequence-editor/tree-utils';
  import { showFailureToast, showSuccessToast } from '../../utilities/toast';
  import { tooltip } from '../../utilities/tooltip';
  import Menu from '../menus/Menu.svelte';
  import MenuItem from '../menus/MenuItem.svelte';
  import CssGrid from '../ui/CssGrid.svelte';
  import CssGridGutter from '../ui/CssGridGutter.svelte';
  import Panel from '../ui/Panel.svelte';
  import SectionTitle from '../ui/SectionTitle.svelte';
  import SelectedCommand from './form/SelectedCommand.svelte';

  export let parcel: Parcel | null;
  export let showCommandFormBuilder: boolean = false;
  export let readOnly: boolean = false;
  export let sequenceName: string = '';
  export let sequenceDefinition: string = '';
  export let sequenceOutput: string = '';
  export let title: string = 'Sequence - Definition Editor';
  export let user: User | null;

  const dispatch = createEventDispatcher<{
    sequence: { input: string; output: string };
  }>();

  let clientHeightGridRightBottom: number;
  let clientHeightGridRightTop: number;
  let compartmentSeqJsonLinter: Compartment;
  let compartmentSeqLanguage: Compartment;
  let compartmentSeqLinter: Compartment;
  let compartmentSeqTooltip: Compartment;
  let compartmentSeqAutocomplete: Compartment;
  let channelDictionary: ChannelDictionary | null;
  let commandDictionary: CommandDictionary | null;
  let disableCopyAndExport: boolean = true;
  let parameterDictionaries: ParameterDictionary[] = [];
  let commandFormBuilderGrid: string;
  let editorOutputDiv: HTMLDivElement;
  let editorOutputView: EditorView;
  let editorSequenceDiv: HTMLDivElement;
  let editorSequenceView: EditorView;
  let menu: Menu;
  let outputFormats: IOutputFormat[];
  let selectedNode: SyntaxNode | null;
  let selectedOutputFormat: IOutputFormat | undefined;
  let toggleSeqJsonPreview: boolean = false;

  $: {
    loadSequenceAdaptation(parcel?.sequence_adaptation_id);
  }

  $: {
    if (editorSequenceView) {
      // insert sequence
      editorSequenceView.dispatch({
        changes: { from: 0, insert: sequenceDefinition, to: editorSequenceView.state.doc.length },
      });

      // apply indentation
      editorSequenceView.update([
        editorSequenceView.state.update({
          selection: { anchor: 0, head: editorSequenceView.state.doc.length },
        }),
      ]);
      indentSelection({
        dispatch: transaction => editorSequenceView.update([transaction]),
        state: editorSequenceView.state,
      });
      // clear selection
      editorSequenceView.update([
        editorSequenceView.state.update({
          selection: { anchor: 0, head: 0 },
        }),
      ]);
    }
  }

  $: {
    commandFormBuilderGrid = showCommandFormBuilder
      ? $userSequenceEditorColumnsWithFormBuilder
      : $userSequenceEditorColumns;
  }

  $: {
    const unparsedChannelDictionary = $channelDictionaries.find(cd => cd.id === parcel?.channel_dictionary_id);
    const unparsedCommandDictionary = $commandDictionaries.find(cd => cd.id === parcel?.command_dictionary_id);
    const unparsedParameterDictionaries = $parameterDictionariesStore.filter(pd => {
      const parameterDictionary = $parcelToParameterDictionaries.find(
        p => p.parameter_dictionary_id === pd.id && p.parcel_id === parcel?.id,
      );

      if (parameterDictionary) {
        return pd;
      }
    });

    if (unparsedCommandDictionary) {
      Promise.all([
        getParsedCommandDictionary(unparsedCommandDictionary, user),
        unparsedChannelDictionary ? getParsedChannelDictionary(unparsedChannelDictionary, user) : null,
        ...unparsedParameterDictionaries.map(unparsedParameterDictionary => {
          return getParsedParameterDictionary(unparsedParameterDictionary, user);
        }),
      ]).then(([parsedCommandDictionary, parsedChannelDictionary, ...parsedParameterDictionaries]) => {
        const nonNullParsedParameterDictionaries = parsedParameterDictionaries.filter(
          (pd): pd is ParameterDictionary => !!pd,
        );

        channelDictionary = parsedChannelDictionary;
        commandDictionary = parsedCommandDictionary;
        parameterDictionaries = nonNullParsedParameterDictionaries;

        // Reconfigure sequence editor.
        editorSequenceView.dispatch({
          effects: [
            compartmentSeqLanguage.reconfigure(
              setupLanguageSupport(
                $sequenceAdaptation.autoComplete(
                  parsedChannelDictionary,
                  parsedCommandDictionary,
                  nonNullParsedParameterDictionaries,
                ),
              ),
            ),
            compartmentSeqLinter.reconfigure(
              inputLinter(parsedChannelDictionary, parsedCommandDictionary, nonNullParsedParameterDictionaries),
            ),
            compartmentSeqTooltip.reconfigure(
              sequenceTooltip(parsedChannelDictionary, parsedCommandDictionary, nonNullParsedParameterDictionaries),
            ),
            compartmentSeqAutocomplete.reconfigure(indentService.of($sequenceAdaptation.autoIndent())),
          ],
        });

        // Reconfigure seq JSON editor.
        editorOutputView.dispatch({
          effects: compartmentSeqJsonLinter.reconfigure(outputLinter(parsedCommandDictionary, selectedOutputFormat)),
        });
      });
    }
  }

  onMount(() => {
    compartmentSeqJsonLinter = new Compartment();
    compartmentSeqLanguage = new Compartment();
    compartmentSeqLinter = new Compartment();
    compartmentSeqTooltip = new Compartment();
    compartmentSeqAutocomplete = new Compartment();

    editorSequenceView = new EditorView({
      doc: sequenceDefinition,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.theme({ '.cm-gutter': { 'min-height': `${clientHeightGridRightTop}px` } }),
        lintGutter(),
        compartmentSeqLanguage.of(setupLanguageSupport($sequenceAdaptation.autoComplete(null, null, []))),
        compartmentSeqLinter.of(inputLinter()),
        compartmentSeqTooltip.of(sequenceTooltip()),
        EditorView.updateListener.of(debounce(sequenceUpdateListener, 250)),
        EditorView.updateListener.of(selectedCommandUpdateListener),
        EditorView.updateListener.of(debounce(highlightBlock, 250)),
        Prec.highest([blockTheme, blockHighlighter]),
        compartmentSeqAutocomplete.of(indentService.of($sequenceAdaptation.autoIndent())),
        EditorState.readOnly.of(readOnly),
      ],
      parent: editorSequenceDiv,
    });

    editorOutputView = new EditorView({
      doc: sequenceOutput,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.theme({ '.cm-gutter': { 'min-height': `${clientHeightGridRightBottom}px` } }),
        EditorView.editable.of(false),
        lintGutter(),
        json(),
        compartmentSeqJsonLinter.of(outputLinter()),
        EditorState.readOnly.of(readOnly),
      ],
      parent: editorOutputDiv,
    });
  });

  onDestroy(() => {
    resetSequenceAdaptation();
  });

  async function loadSequenceAdaptation(id: number | null | undefined): Promise<void> {
    if (id) {
      const adaptation = await effects.getSequenceAdaptation(id, user);

      if (adaptation) {
        try {
          setSequenceAdaptation(eval(String(adaptation.adaptation)));
        } catch (e) {
          console.error(e);
          showFailureToast('Invalid sequence adaptation');
        }
      }
    } else {
      resetSequenceAdaptation();
    }

    outputFormats = $outputFormat;
    selectedOutputFormat = outputFormats[0];
  }

  function resetSequenceAdaptation(): void {
    setSequenceAdaptation(undefined);
  }

  function compile(): void {
    if (selectedOutputFormat?.compile) {
      selectedOutputFormat.compile(sequenceOutput);
    }
  }

  async function sequenceUpdateListener(viewUpdate: ViewUpdate): Promise<void> {
    const sequence = viewUpdate.state.doc.toString();
    disableCopyAndExport = sequence === '';
    const tree = syntaxTree(viewUpdate.state);
    const output = await selectedOutputFormat?.toOutputFormat?.(tree, sequence, commandDictionary, sequenceName);

    if ($sequenceAdaptation?.modifyOutput !== undefined && output !== undefined) {
      $sequenceAdaptation?.modifyOutput(output, parameterDictionaries, channelDictionary);
    }

    editorOutputView.dispatch({ changes: { from: 0, insert: output, to: editorOutputView.state.doc.length } });

    if (output !== undefined) {
      dispatch('sequence', { input: sequence, output });
    }
  }

  function selectedCommandUpdateListener(viewUpdate: ViewUpdate): void {
    // This is broken out into a different listener as debouncing this can cause cursor to move around
    const tree = syntaxTree(viewUpdate.state);
    // Command Node includes trailing newline and white space, move to next command
    const selectionLine = viewUpdate.state.doc.lineAt(viewUpdate.state.selection.asSingle().main.from);
    const leadingWhiteSpaceLength = selectionLine.text.length - selectionLine.text.trimStart().length;
    const updatedSelectionNode = tree.resolveInner(selectionLine.from + leadingWhiteSpaceLength, 1);
    // minimize triggering selected command view
    if (selectedNode !== updatedSelectionNode) {
      selectedNode = updatedSelectionNode;
    }
  }

  const blockMark = Decoration.mark({ class: 'cm-block-match' });

  const blockTheme = EditorView.baseTheme({
    '.cm-block-match': {
      outline: '1px dashed',
    },
  });

  function highlightBlock(viewUpdate: ViewUpdate): SyntaxNode[] {
    const tree = syntaxTree(viewUpdate.state);
    // Command Node includes trailing newline and white space, move to next command
    const selectionLine = viewUpdate.state.doc.lineAt(viewUpdate.state.selection.asSingle().main.from);
    const leadingWhiteSpaceLength = selectionLine.text.length - selectionLine.text.trimStart().length;
    const updatedSelectionNode = tree.resolveInner(selectionLine.from + leadingWhiteSpaceLength, 1);
    const stemNode = getNearestAncestorNodeOfType(updatedSelectionNode, [TOKEN_COMMAND])?.getChild('Stem');

    if (!stemNode || !isBlockCommand(viewUpdate.state.sliceDoc(stemNode.from, stemNode.to))) {
      return [];
    }

    const blocks = computeBlocks(viewUpdate.state);
    if (!blocks) {
      return [];
    }

    const pairs = Object.values(blocks);
    const matchedNodes: SyntaxNode[] = [stemNode];

    // when cursor on end -- select else and if
    let current: SyntaxNode | undefined = stemNode;
    while (current) {
      current = pairs.find(block => block.end?.from === current!.from)?.start;
      if (current) {
        matchedNodes.push(current);
      }
    }

    // when cursor on if -- select else and end
    current = stemNode;
    while (current) {
      current = pairs.find(block => block.start?.from === current!.from)?.end;
      if (current) {
        matchedNodes.push(current);
      }
    }

    return matchedNodes;
  }

  const blockHighlighter = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor() {
        this.decorations = Decoration.none;
      }
      update(viewUpdate: ViewUpdate): DecorationSet | null {
        if (viewUpdate.selectionSet || viewUpdate.docChanged || viewUpdate.viewportChanged) {
          const blocks = highlightBlock(viewUpdate);
          this.decorations = Decoration.set(
            // codemirror requires marks to be in sorted order
            blocks.sort((a, b) => a.from - b.from).map(block => blockMark.range(block.from, block.to)),
          );
          return this.decorations;
        }
        return null;
      }
    },
    {
      decorations: viewPluginSpecification => viewPluginSpecification.decorations,
    },
  );

  function downloadOutputFormat(outputFormat: IOutputFormat): void {
    const fileExtension = `${sequenceName}.${selectedOutputFormat?.fileExtension}`;

    if (outputFormat?.fileExtension === 'json') {
      downloadJSON(JSON.parse(editorOutputView.state.doc.toString()), fileExtension);
    } else {
      downloadBlob(new Blob([editorOutputView.state.doc.toString()], { type: 'text/plain' }), fileExtension);
    }
  }

  function downloadInputFormat(): void {
    downloadBlob(new Blob([editorSequenceView.state.doc.toString()], { type: 'text/plain' }), `${sequenceName}.txt`);
  }

  async function copyOutputFormatToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(editorOutputView.state.doc.toString());
      showSuccessToast(`${selectedOutputFormat?.name} copied to clipboard`);
    } catch {
      showFailureToast(`Error copying ${selectedOutputFormat?.name} to clipboard`);
    }
  }

  async function copyInputFormatToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(editorSequenceView.state.doc.toString());
      showSuccessToast(`${$inputFormat?.name} copied to clipboard`);
    } catch {
      showFailureToast(`Error copying ${$inputFormat?.name} to clipboard`);
    }
  }

  function toggleSeqJsonEditor(): void {
    toggleSeqJsonPreview = !toggleSeqJsonPreview;
  }
</script>

<CssGrid bind:columns={commandFormBuilderGrid} minHeight={'0'}>
  <CssGrid rows={toggleSeqJsonPreview ? '1fr 3px 1fr' : '1.88fr 3px 80px'} minHeight={'0'}>
    <Panel>
      <svelte:fragment slot="header">
        <SectionTitle>{title}</SectionTitle>

        <div class="right">
          <button
            use:tooltip={{ content: `Copy sequence contents as ${$inputFormat?.name} to clipboard`, placement: 'top' }}
            class="st-button icon-button secondary ellipsis"
            on:click={copyInputFormatToClipboard}
            disabled={disableCopyAndExport}><ClipboardIcon /> {$inputFormat?.name}</button
          >
          <button
            use:tooltip={{
              content: `Download sequence contents as ${$inputFormat?.name}`,
              placement: 'top',
            }}
            class="st-button icon-button secondary ellipsis"
            on:click|stopPropagation={downloadInputFormat}
            disabled={disableCopyAndExport}><DownloadIcon /> {$inputFormat?.name}</button
          >

          <div class="app-menu" role="none" on:click|stopPropagation={() => menu.toggle()}>
            <button class="st-button icon-button secondary ellipsis">
              Output

              <ChevronDownIcon />
            </button>

            <Menu bind:this={menu}>
              {#each outputFormats as outputFormatItem}
                <div
                  use:tooltip={{
                    content: `Copy sequence contents as ${outputFormatItem?.name} to clipboard`,
                    placement: 'top',
                  }}
                >
                  <MenuItem on:click={copyOutputFormatToClipboard} disabled={disableCopyAndExport}>
                    <ClipboardIcon />
                    {outputFormatItem?.name}
                  </MenuItem>
                </div>

                <div
                  use:tooltip={{
                    content: `Download sequence contents as ${outputFormatItem?.name}`,
                    placement: 'top',
                  }}
                >
                  <MenuItem on:click={() => downloadOutputFormat(outputFormatItem)} disabled={disableCopyAndExport}>
                    <DownloadIcon />
                    {outputFormatItem?.name}
                  </MenuItem>
                </div>
              {/each}
            </Menu>
          </div>

          {#if selectedOutputFormat?.compile}
            <button class="st-button icon-button secondary ellipsis" on:click={compile}>Compile</button>
          {/if}
        </div>
      </svelte:fragment>

      <svelte:fragment slot="body">
        <div bind:this={editorSequenceDiv} />
      </svelte:fragment>
    </Panel>

    <CssGridGutter draggable={toggleSeqJsonPreview} track={1} type="row" />
    <Panel>
      <svelte:fragment slot="header">
        <SectionTitle>{selectedOutputFormat?.name} (Read-only)</SectionTitle>

        <div class="right">
          {#if outputFormats}
            <div class="output-format">
              <label for="outputFormat">Output Format</label>
              <select bind:value={selectedOutputFormat} class="st-select w-100" name="outputFormat">
                {#each outputFormats as outputFormatItem}
                  <option value={outputFormatItem}>
                    {outputFormatItem.name}
                  </option>
                {/each}
              </select>
            </div>
          {/if}

          <button
            use:tooltip={{ content: toggleSeqJsonPreview ? `Collapse Editor` : `Expand Editor`, placement: 'top' }}
            class="st-button icon"
            on:click={toggleSeqJsonEditor}
          >
            {#if toggleSeqJsonPreview}
              <CollapseIcon />
            {:else}
              <ExpandIcon />
            {/if}</button
          >
        </div>
      </svelte:fragment>

      <svelte:fragment slot="body">
        <div bind:this={editorOutputDiv} />
      </svelte:fragment>
    </Panel>
  </CssGrid>

  <CssGridGutter track={1} type="column" />

  {#if showCommandFormBuilder}
    {#if !!commandDictionary && !!selectedNode}
      <SelectedCommand
        node={selectedNode}
        {channelDictionary}
        {commandDictionary}
        {editorSequenceView}
        {parameterDictionaries}
      />
    {:else}
      <Panel overflowYBody="hidden" padBody={false}>
        <svelte:fragment slot="header">
          <SectionTitle>Selected Command</SectionTitle>
        </svelte:fragment>

        <svelte:fragment slot="body">
          <div class="st-typography-body no-selected-parcel">Select a parcel to enable the Selected Command panel.</div>
        </svelte:fragment>
      </Panel>
    {/if}
  {/if}
</CssGrid>

<style>
  .app-menu {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 5px;
    justify-content: center;
    position: relative;
  }

  .no-selected-parcel {
    padding: 8px;
  }

  .right {
    align-items: center;
    display: flex;
    justify-content: space-around;
  }

  .icon-button {
    align-items: center;
    column-gap: 5px;
    display: flex;
    margin: 2px;
  }

  .output-format {
    align-items: center;
    display: flex;
  }

  .output-format label {
    width: 10rem;
  }
</style>
