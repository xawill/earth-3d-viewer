import { Component, EventEmitter, Output, Input, HostListener, OnInit } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { initFlowbite } from 'flowbite';

@Component({
	selector: 'time-of-day-settings',
	imports: [ReactiveFormsModule],
	templateUrl: './time-of-day.component.html',
	styleUrl: './time-of-day.component.css',
})
export class TimeOfDaySettingsComponent implements OnInit {
	@Input() referenceDate: Date = new Date();
	@Output() timeOfDaySettings = new EventEmitter<TimeOfDaySettings>();

	timeOfDayForm = new FormGroup({
		totalMinutes: new FormControl(720, { nonNullable: true }), // 720 minutes = 12:00
	});

	constructor() {
		// Emit time of day settings changes
		this.timeOfDayForm.valueChanges.subscribe(values => {
			this.timeOfDaySettings.emit({
				totalMinutes: values.totalMinutes?.valueOf(),
			});
		});
	}

	ngOnInit(): void {
		this.timeOfDayForm.patchValue(
			{ totalMinutes: this.referenceDate.getHours() * 60 + this.referenceDate.getMinutes() },
			{ emitEvent: true }
		);
	}

	ngAfterViewInit() {
		initFlowbite();
	}

	getTimeDisplay(): string {
		const totalMinutes = this.timeOfDayForm.get('totalMinutes')?.value ?? 720;
		const hour = Math.floor(totalMinutes / 60);
		const minute = totalMinutes % 60;
		return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
	}

	@HostListener('touchmove', ['$event'])
	onTouchMove(event: TouchEvent): void {
		// Prevent scrolling when interacting with the component
		if ((event.target as HTMLElement).closest('input[type="range"]')) {
			event.preventDefault();
		}
	}

	@HostListener('wheel', ['$event'])
	onWheel(event: WheelEvent): void {
		// Prevent wheel scrolling on the slider
		if ((event.target as HTMLElement).closest('input[type="range"]')) {
			event.preventDefault();
		}
	}
}

export interface TimeOfDaySettings {
	totalMinutes?: number;
}
