# SMARTBUS 360 — Testing

## How to run
```powershell
scripts\run_tests.bat
# or
cd backend
..\.venv\Scripts\python.exe -m pytest -v
```
Each test creates its **own temporary SQLite file** (`tmp_path/test_smartbus360.db`) with `TestConfig`; the real
database is never touched. The background device monitor and mDNS are disabled during tests.

Frontend checks:
```powershell
cd frontend
npm run typecheck     # TypeScript strict mode
npm run build         # production build into frontend\dist
```

## Coverage of the acceptance criteria
| Requirement | Test(s) |
|---|---|
| Admin / student / bus login | `test_auth.py::test_admin_login_and_me`, `test_student_login_requires_password_change`, `test_bus_login` |
| Role-based access restrictions | `test_admin.py::test_role_based_access_restrictions`, `test_auth.py::test_unauthenticated_api_access_blocked` |
| Admin-only account creation | `test_admin.py::test_only_admin_can_create_accounts` |
| Duplicate register number / bus number | `test_duplicate_register_number_rejected`, `test_duplicate_bus_number_rejected` |
| Students have no RFID | `test_admin.py::test_students_have_no_rfid` |
| Driver ID card (bus RFID): duty toggle, duplicates, unknown / other-bus cards, validation, unique UID | `test_driver_rfid.py` (5 tests), `test_driver_rfid_event_only_to_admin_and_own_bus` |
| Students onboard from occupancy sensors | `test_device.py::test_students_onboard_comes_from_occupancy_sensor` |
| Student location submission | `test_student_and_pickups.py::test_student_location_submission` |
| Pickup request creation | `test_pickup_request_creation_and_status`, `test_pickup_with_stop_only_uses_stop_coordinates`, `test_multiple_students_requests_do_not_overwrite` |
| Pickup visible to assigned bus | `test_pickup_visible_to_assigned_bus_only`, `test_pickup_reaches_esp32_command_queue` |
| Unauthorized access to another bus | `test_bus_cannot_modify_another_bus_request`, `test_student_cannot_see_or_cancel_others_requests` |
| GPS coordinate validation | `test_gps_coordinate_validation`, `test_device.py::test_gps_ingestion_and_validation` |
| Occupancy telemetry validation | `test_device.py::test_occupancy_validation`, `test_combined_telemetry_partial_rejection` |
| Alcohol telemetry validation | `test_device.py::test_alcohol_validation_and_warning` |
| SOS creation + duplicate handling | `test_sos_incident_creation_and_duplicates`, `test_sos_never_rejected_for_bad_gps_or_clock` |
| Device token authentication | `test_device_token_authentication`, `test_device_disabled_after_removal`, `test_admin.py::test_device_token_shown_once_and_stored_hashed` |
| Device-to-bus authorization | `test_device_to_bus_authorization`, `test_command_ack` |
| Socket event authorization | `test_sockets_and_persistence.py::test_socket_event_authorization`, `test_socket_rejects_unauthenticated`, `test_socket_rejects_pending_password_change`, `test_socket_origin_policy` |
| Database persistence | `test_database_persistence` (second app instance reads the same file) |
| Health check | `test_auth.py::test_health_endpoint` |
| Extra | CSRF, rate limiting, logout, deactivation, password hashing/no plaintext in API/CSV/audit, report types, online status, SPA routing |

## Actual results (executed while building this release, Linux, Python 3.13.16)
```
tests/test_admin.py::test_role_based_access_restrictions PASSED
tests/test_admin.py::test_only_admin_can_create_accounts PASSED
tests/test_admin.py::test_duplicate_register_number_rejected PASSED
tests/test_admin.py::test_username_collision_gets_suffix PASSED
tests/test_admin.py::test_students_have_no_rfid PASSED
tests/test_admin.py::test_duplicate_bus_number_rejected PASSED
tests/test_admin.py::test_passwords_are_hashed_and_never_listed PASSED
tests/test_admin.py::test_stop_must_belong_to_bus_route PASSED
tests/test_admin.py::test_overview_reports_real_counts_without_fake_data PASSED
tests/test_admin.py::test_device_token_shown_once_and_stored_hashed PASSED
tests/test_admin.py::test_reports_all_types PASSED
tests/test_admin.py::test_reset_password_forces_change PASSED
tests/test_auth.py::test_health_endpoint PASSED
tests/test_auth.py::test_admin_login_and_me PASSED
tests/test_auth.py::test_login_wrong_password_rejected PASSED
tests/test_auth.py::test_login_rate_limited PASSED
tests/test_auth.py::test_student_login_requires_password_change PASSED
tests/test_auth.py::test_bus_login PASSED
tests/test_auth.py::test_csrf_required_for_mutations PASSED
tests/test_auth.py::test_logout_invalidates_session PASSED
tests/test_auth.py::test_deactivated_user_cannot_login PASSED
tests/test_auth.py::test_unauthenticated_api_access_blocked PASSED
tests/test_device.py::test_device_token_authentication PASSED
tests/test_device.py::test_device_register PASSED
tests/test_device.py::test_device_to_bus_authorization PASSED
tests/test_device.py::test_device_disabled_after_removal PASSED
tests/test_device.py::test_gps_ingestion_and_validation PASSED
tests/test_device.py::test_occupancy_validation PASSED
tests/test_device.py::test_alcohol_validation_and_warning PASSED
tests/test_device.py::test_sos_incident_creation_and_duplicates PASSED
tests/test_device.py::test_sos_never_rejected_for_bad_gps_or_clock PASSED
tests/test_device.py::test_students_onboard_comes_from_occupancy_sensor PASSED
tests/test_device.py::test_command_ack PASSED
tests/test_device.py::test_combined_telemetry_partial_rejection PASSED
tests/test_device.py::test_device_online_status PASSED
tests/test_driver_rfid.py::test_driver_card_toggles_duty PASSED
tests/test_driver_rfid.py::test_driver_card_duplicate_event_ignored PASSED
tests/test_driver_rfid.py::test_unknown_and_other_bus_cards_rejected PASSED
tests/test_driver_rfid.py::test_driver_card_validation PASSED
tests/test_driver_rfid.py::test_no_card_registered_means_rejected PASSED
tests/test_sockets_and_persistence.py::test_socket_rejects_unauthenticated PASSED
tests/test_sockets_and_persistence.py::test_socket_rejects_pending_password_change PASSED
tests/test_sockets_and_persistence.py::test_socket_event_authorization PASSED
tests/test_sockets_and_persistence.py::test_database_persistence PASSED
tests/test_sockets_and_persistence.py::test_spa_routes_without_build PASSED
tests/test_sockets_and_persistence.py::test_socket_origin_policy PASSED
tests/test_sockets_and_persistence.py::test_driver_rfid_event_only_to_admin_and_own_bus PASSED
tests/test_student_and_pickups.py::test_student_location_submission PASSED
tests/test_student_and_pickups.py::test_gps_coordinate_validation PASSED
tests/test_student_and_pickups.py::test_pickup_request_creation_and_status PASSED
tests/test_student_and_pickups.py::test_pickup_with_stop_only_uses_stop_coordinates PASSED
tests/test_student_and_pickups.py::test_multiple_students_requests_do_not_overwrite PASSED
tests/test_student_and_pickups.py::test_second_active_request_rejected PASSED
tests/test_student_and_pickups.py::test_pickup_visible_to_assigned_bus_only PASSED
tests/test_student_and_pickups.py::test_bus_cannot_modify_another_bus_request PASSED
tests/test_student_and_pickups.py::test_pickup_status_flow_and_history PASSED
tests/test_student_and_pickups.py::test_bus_cancel_requires_reason PASSED
tests/test_student_and_pickups.py::test_student_cannot_see_or_cancel_others_requests PASSED
tests/test_student_and_pickups.py::test_pickup_reaches_esp32_command_queue PASSED
tests/test_student_and_pickups.py::test_bus_status_without_hardware_data_is_explicit PASSED
============================= 60 passed in 47.71s ==============================
```

Additional checks executed for this release:
* `alembic` drift check (`flask --app run db check`): **No new upgrade operations detected** (migrations match models).
* Migrations `remove rfid` and `driver rfid duty` were applied in sequence; `remove rfid` was applied to a database that already contained RFID data: upgrade succeeded and all other data was kept.
* `npm run typecheck` (tsc strict): **0 errors**; `vite build`: **success**.
* Browser end-to-end run (headless Chromium against the real server with a fresh database, seeded only through the
  public API): admin, student (mobile viewport) and bus dashboards rendered; a bus **Accept** click updated the
  student's pickup tracker live; a device `POST /api/device/sos` appeared live on the bus console, admin emergency
  center and the student page without reloads; an over-capacity occupancy reading was rejected and shown as the
  device's last error. The only console errors were blocked OpenStreetMap tile downloads (no internet in the test
  sandbox) and the expected `401` from the session check on the login page.
* HTTPS mode started with a generated self-signed certificate and `/api/health` answered over TLS.
* `scripts/db_backup.py backup` produced an integrity-checked backup.

Not executed here: Windows `.bat` scripts (written for Windows 10/11; the commands they run were exercised on Linux),
and anything requiring the physical ESP32 hardware (see README → Known limitations).
