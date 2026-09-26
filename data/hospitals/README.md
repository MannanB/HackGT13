# Hospital bed capacity

`build_hospital_beds.py` downloads the latest-record CMS Provider Specific Files plus the CMS
Hospital Provider Cost Report utilization dataset and writes the small, reviewed lookup used by
the frontend:

```bash
python3 data/hospitals/build_hospital_beds.py
```

The source extracts in `raw/` are ignored by Git. The generated
`frontend/src/data/hospitalBeds.json` is tracked so the app works without a runtime CMS request.

The crosswalk is deliberately conservative. A map hospital without a confident CMS CCN match is
left with unknown capacity; the simulation never substitutes a median bed count.

For matched hospitals, starting occupancy is `reported inpatient days / reported bed-days
available`. Average length of stay is `reported inpatient days / reported discharges`. These are
historical annual operating estimates, not live bed availability.
