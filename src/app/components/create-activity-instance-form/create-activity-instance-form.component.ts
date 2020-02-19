import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  NgModule,
  OnDestroy,
  Output,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { SubSink } from 'subsink';
import { MaterialModule } from '../../material';
import {
  CActivityType,
  CActivityTypeMap,
  SActivityInstance,
} from '../../types';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-create-activity-instance-form',
  templateUrl: './create-activity-instance-form.component.html',
})
export class CreateActivityInstanceFormComponent implements OnDestroy {
  @Input()
  activityTypes: CActivityType[] = [];

  @Input()
  activityTypesMap: CActivityTypeMap | null = null;

  @Input()
  createActivityInstanceError: string | null = null;

  @Output()
  create: EventEmitter<SActivityInstance> = new EventEmitter<
    SActivityInstance
  >();

  form: FormGroup;

  private subs = new SubSink();

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      parameters: this.fb.array([]),
      startTimestamp: ['', Validators.required],
      type: ['', Validators.required],
    });
    const { controls } = this.form;

    this.subs.add(
      controls.type.valueChanges.subscribe(type => {
        if (this.activityTypesMap) {
          const { parameters } = this.activityTypesMap[type];
          this.formParameters.clear();
          parameters.forEach(parameter => {
            this.formParameters.push(
              this.fb.group({
                name: parameter.name,
                type: parameter.type,
                value: parameter.default,
              }),
            );
          });
        }
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get formParameters() {
    return this.form.get('parameters') as FormArray;
  }

  onSubmit() {
    if (this.form.valid) {
      const parameters = this.form.value.parameters.reduce(
        (parameterMap, parameter) => {
          if (parameter.value !== '') {
            if (parameter.type === 'double') {
              parameterMap[parameter.name] = parseFloat(parameter.value);
            } else {
              parameterMap[parameter.name] = parameter.value;
            }
          }
          return parameterMap;
        },
        {},
      );
      const activityInstance: SActivityInstance = {
        ...this.form.value,
        parameters,
      };
      this.create.emit(activityInstance);
    }
  }
}

@NgModule({
  declarations: [CreateActivityInstanceFormComponent],
  exports: [CreateActivityInstanceFormComponent],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
})
export class CreateActivityInstanceFormModule {}
