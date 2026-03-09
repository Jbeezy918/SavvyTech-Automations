# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Home Assistant configuration directory (version 2025.4.4). Home Assistant is running on Windows PC at `192.168.68.75:8124`.

## Configuration Structure

```
homeassistant/
├── configuration.yaml     # Main config - loads themes, automations, scripts, scenes
├── automations.yaml       # Automation definitions (currently empty)
├── scripts.yaml           # Script definitions (currently empty)
├── scenes.yaml            # Scene definitions (currently empty)
├── secrets.yaml           # Sensitive values (!secret references)
├── blueprints/            # Reusable automation templates
│   └── automation/homeassistant/
│       ├── motion_light.yaml
│       └── notify_leaving_zone.yaml
├── .storage/              # Internal HA state (device/entity registries, auth)
├── deps/                  # Python dependencies (do not modify)
└── home-assistant_v2.db   # SQLite database for history/state
```

## YAML Configuration

**Include patterns used:**
- `!include filename.yaml` - Include entire file
- `!include_dir_merge_named themes` - Merge all YAML files in themes/ directory

**Secrets:** Use `!secret key_name` to reference values from `secrets.yaml`

## Adding Automations

Add to `automations.yaml`:
```yaml
- id: 'unique_id'
  alias: 'Friendly Name'
  description: 'What it does'
  triggers:
    - trigger: state
      entity_id: binary_sensor.motion
      to: 'on'
  actions:
    - action: light.turn_on
      target:
        entity_id: light.living_room
```

## Blueprints

Blueprints are reusable automation templates. Use `!input` for configurable values:
```yaml
blueprint:
  name: Blueprint Name
  domain: automation
  input:
    my_input:
      name: Input Name
      selector:
        entity: {}
```

## Testing Configuration

Validate config before restarting:
```bash
# From HA container/install:
hass --script check_config -c /config

# Or call HA API:
curl -X POST http://192.168.68.75:8124/api/config/core/check_config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Network Access

- **Home Assistant URL**: http://192.168.68.75:8124
- **Windows Firewall**: Port 8124 TCP must be allowed
