import { Component, input, output, signal, computed, effect, HostListener } from '@angular/core';
import { initFlowbite } from 'flowbite';

@Component({
	selector: 'time-of-day-settings',
	imports: [],
	templateUrl: './time-of-day.component.html',
	styleUrl: './time-of-day.component.css',
})
export class TimeOfDaySettingsComponent {
	timeOfDaySettings = output<TimeOfDaySettings>();

	referenceDate = input<Date>(new Date());

	totalMinutes = signal(720); // 720 minutes = 12h00
	timeDisplay = computed(() => {
		const totalMins = this.totalMinutes();
		const hour = Math.floor(totalMins / 60);
		const minute = totalMins % 60;
		return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
	});

	constructor() {
		effect(() => {
			const referenceDate = this.referenceDate();
			if (referenceDate) {
				this.totalMinutes.set(referenceDate.getHours() * 60 + referenceDate.getMinutes());
			}
		});

		effect(() => {
			const totalMinutes = this.totalMinutes();
			this.timeOfDaySettings.emit({ totalMinutes });
		});
	}

	ngAfterViewInit() {
		initFlowbite();
	}

	onTimeSliderChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.totalMinutes.set(+value);
	}
}

export interface TimeOfDaySettings {
	totalMinutes?: number;
}
