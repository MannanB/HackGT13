# Hourly visitor profiles

The timeline uses two public, nationally representative 2022 datasets:

- The Federal Highway Administration's National Household Travel Survey
  (NHTS) supplies weighted arrival-time profiles by destination purpose.
- The CDC National Hospital Ambulatory Medical Care Survey (NHAMCS) supplies
  the 24-hour emergency-department arrival profile used for hospitals.
- The AHRQ Medical Expenditure Panel Survey reported about 340 million hospital
  outpatient visits in 2024. The model uses one outpatient visit per person-year
  as a national proxy and distributes those visits using the NHTS medical profile.

Run the builder from the repository root:

```bash
python3 data/time_profiles/build_hourly_profiles.py
```

It downloads the raw ZIP files into `data/time_profiles/raw/` (gitignored) and
writes the small, reviewable artifact at
`frontend/src/data/hourlyDemandProfiles.json`.

These profiles are national time-of-day proxies. Hospital demand combines 0.473
emergency visits per person-year with 1 outpatient hospital visit per person-year.
Block groups denser than the Census Bureau's 2020 Atlanta urban-area benchmark
of 1,998 people per square mile receive a square-root density uplift capped at
2.5×. This is a bounded planning adjustment, not a clinical risk estimate or
measured foot traffic for a particular Atlanta facility.
