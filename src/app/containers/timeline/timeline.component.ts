import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgModule,
  Output,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppActions, PlanningActions } from '../../actions';
import { RootState } from '../../app-store';
import { TimeAxisGlobalModule, TimeAxisModule } from '../../components';
import { BandModule } from '../../components/band/band.component';
import {
  Band,
  CreateActivityInstance,
  CreatePoint,
  DeletePoint,
  Guide,
  GuideDialogData,
  SavePoint,
  SelectPoint,
  TimeRange,
  UpdateBand,
  UpdatePoint,
  Violation,
} from '../../types';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-timeline',
  styleUrls: ['./timeline.component.css'],
  templateUrl: './timeline.component.html',
})
export class TimelineComponent implements AfterViewChecked {
  @Input()
  bands: Band[] | null | undefined;

  @Input()
  constraintViolations: Violation[] | undefined = [];

  @Input()
  marginBottom = 10;

  @Input()
  marginLeft = 100;

  @Input()
  marginRight = 40;

  @Input()
  marginTop = 10;

  @Input()
  maxTimeRange: TimeRange = { end: 0, start: 0 };

  @Input()
  verticalGuides: Guide[];

  @Input()
  viewTimeRange: TimeRange = { end: 0, start: 0 };

  @Output()
  showDrawerType: EventEmitter<string> = new EventEmitter<string>();

  @ViewChild('bandContainer', { static: true })
  bandContainer: ElementRef<HTMLDivElement>;

  @ViewChild('timeAxisContainer', { static: true })
  timeAxisContainer: ElementRef<HTMLDivElement>;

  constructor(
    private elRef: ElementRef,
    private route: ActivatedRoute,
    private store: Store<RootState>,
  ) {}

  ngAfterViewChecked(): void {
    this.setBandContainerMaxHeight();
  }

  onDeleteHorizontalGuide(guide: Guide): void {
    this.store.dispatch(PlanningActions.guideRemove({ guide }));
  }

  onOpenGuideDialog(data: GuideDialogData): void {
    this.store.dispatch(PlanningActions.guideOpenDialog({ data }));
  }

  onUpdateHorizontalGuide(guide: Partial<Guide>): void {
    this.store.dispatch(
      PlanningActions.guideUpdate({ changes: guide, id: guide.id }),
    );
  }

  onCreatePoint(event: CreatePoint): void {
    if (event.type === 'activity') {
      const { id: planId } = this.route.snapshot.params;
      const activityType = event.activityType;
      const activityInstance: CreateActivityInstance = {
        parameters: [],
        startTimestamp: event.startTimestamp,
        type: activityType.name,
      };
      this.store.dispatch(
        PlanningActions.createActivityInstance({ activityInstance, planId }),
      );
    }
  }

  onDeletePoint(event: DeletePoint): void {
    if (event.type === 'activity') {
      const { id: planId } = this.route.snapshot.params;
      this.store.dispatch(
        PlanningActions.deleteActivityInstance({
          activityInstanceId: event.id,
          planId,
        }),
      );
    }
  }

  onSavePoint(event: SavePoint): void {
    if (event.type === 'activity') {
      const { id: planId } = this.route.snapshot.params;
      this.store.dispatch(
        PlanningActions.updateActivityInstance({
          activityInstance: { ...event.value, id: event.id },
          planId,
        }),
      );
    }
  }

  onSelectPoint(event: SelectPoint): void {
    if (event.type === 'activity') {
      this.store.dispatch(
        PlanningActions.setSelectedActivityInstanceId({
          keepSelected: true,
          selectedActivityInstanceId: event.id,
        }),
      );
      this.showDrawerType.emit('selectedActivityInstance');
    }
  }

  onUpdateBand(event: UpdateBand): void {
    const { id, update } = event;
    this.store.dispatch(PlanningActions.updateBand({ id, update }));
    this.store.dispatch(AppActions.resize());
  }

  onUpdatePoint(event: UpdatePoint): void {
    if (event.type === 'activity') {
      this.store.dispatch(
        PlanningActions.updateActivityInstanceSuccess({
          activityInstance: { ...event.value, id: event.id },
        }),
      );
    }
  }

  onUpdateViewTimeRange(viewTimeRange: TimeRange): void {
    this.store.dispatch(PlanningActions.updateViewTimeRange({ viewTimeRange }));
  }

  setBandContainerMaxHeight() {
    const cssStyle = getComputedStyle(document.documentElement);
    const toolbarHeightProperty = cssStyle.getPropertyValue('--toolbar-height');
    const toolbarHeight = parseInt(toolbarHeightProperty, 10);

    const { clientHeight: height } = this.elRef.nativeElement.parentElement;
    const { nativeElement: timeAxisContainer } = this.timeAxisContainer;
    const { nativeElement: bandContainer } = this.bandContainer;
    const offsetTop = toolbarHeight + timeAxisContainer.clientHeight;
    const maxHeight = `${height - offsetTop}px`;

    bandContainer.style.setProperty('--max-height', maxHeight);
  }

  trackByBands(_: number, band: Band): string {
    return band.id;
  }
}

@NgModule({
  declarations: [TimelineComponent],
  exports: [TimelineComponent],
  imports: [BandModule, CommonModule, TimeAxisModule, TimeAxisGlobalModule],
})
export class TimelineModule {}
