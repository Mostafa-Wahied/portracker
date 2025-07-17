<div align="center">
  <img src="frontend\public\portracker-logo.svg" alt="portracker Logo" width="170"/>
  <h1 style="font-size: 3em; margin-bottom: 0.1em;">portracker</h1>
</div>

<p align="center">
  <strong>A self-hosted, real-time port monitoring and discovery tool.</strong>
</p>

<p align="center">
  <a href="https://github.com/mostafa-wahied/portracker/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mostafa-wahied/portracker?style=flat-square" alt="License"></a>
  <a href="https://hub.docker.com/r/mostafawahied/portracker"><img src="https://img.shields.io/docker/v/mostafawahied/portracker?label=docker&style=flat-square" alt="Docker Version"></a>
  <a href="https://github.com/mostafa-wahied/portracker/releases"><img src="https://img.shields.io/github/v/release/mostafa-wahied/portracker?style=flat-square" alt="Latest Release"></a>
    <a href="https://github.com/mostafa-wahied/portracker/actions"><img src="https://img.shields.io/github/actions/workflow/status/mostafa-wahied/portracker/docker-publish.yml?style=flat-square" alt="Build Status"></a>
</p>

<p align="center">
  <img src="https://i.postimg.cc/vHcsH0TY/main-light.png" alt="portracker Dashboard Screenshot" style="width: 95%;" />
</p>

By auto-discovering services on your systems, portracker provides a live, accurate map of your network. It helps eliminate manual tracking in spreadsheets and prevents deployment failures caused by port conflicts.

---

## Key Features

- **Automatic Port Discovery**: Scans the host system to find and display running services and their ports automatically. No manual data entry is needed.
- **Platform-Specific Collectors**: Includes specialized collectors for Docker and TrueNAS to gather rich, contextual information from the host.
- **Lightweight & Self-Contained**: Runs as a single process with an embedded SQLite database. No external database dependencies like PostgreSQL or Redis are required.
- **Peer-to-Peer Monitoring**: Add other `portracker` instances as peers to view all your servers, containers, and VMs from a single dashboard.
- **Hierarchical Grouping**: Organize servers in a parent-child structure, perfect for nesting servers, e.g. a VM's `portracker` instance under its physical host.
- **Enhanced TrueNAS Discovery**: Providing an optional TrueNAS API key allows `portracker` to discover running VMs\* and gather enhanced system information like the OS version and uptime.
- **Modern & Responsive UI**: A clean dashboard with light/dark modes, live filtering, and multiple data layout views (list, grid, table).

<sub>\*_Note: VMs discovered on TrueNAS with the optional API key are shown in read-only mode. To enable full monitoring, deploy a Portracker instance on each VM and add it as a separate server._</sub>

## Deployment

Deployment is designed to be simple using Docker.

### Option 1: Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  portracker:
    image: mostafawahied/portracker:latest
    container_name: portracker
    restart: unless-stopped
    network_mode: "host"
    volumes:
      # Required for data persistence
      - ./portracker-data:/data
      # Required for discovering services running in Docker
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - DATABASE_PATH=/data/portracker.db
      - PORT=4999
      # Optional: For enhanced TrueNAS features
      # - TRUENAS_API_KEY=your-api-key-here
```

Then, run the application:

```sh
docker-compose up -d
```

### Option 2: Docker Run

For a single-line command deployment:

```sh
docker run -d \
  --name portracker \
  --restart unless-stopped \
  --network host \
  -v ./portracker-data:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e DATABASE_PATH=/data/portracker.db \
  -e PORT=4999 \
  mostafawahied/portracker:latest
```

## Configuration

Configure `portracker` using environment variables.

| Variable           | Description                                            | Default               |
| ------------------ | ------------------------------------------------------ | --------------------- |
| `PORT`\*           | The port the web application will run on.              | `4999`                |
| `DATABASE_PATH`\*  | Path inside the container to the SQLite database file. | `/data/portracker.db` |
| `TRUENAS_API_KEY`  | Optional API key for enhanced TrueNAS data collection. | ` `                   |
| `CACHE_TIMEOUT_MS` | Duration in milliseconds to cache scan results.        | `60000`               |
| `DISABLE_CACHE`    | Set to `true` to disable all caching.                  | `false`               |
| `INCLUDE_UDP`      | Set to `true` to include UDP ports in scans.           | `false`               |
| `DEBUG`            | Set to `true` for verbose application logging.         | `false`               |

<sub>\*_Required_</sub>

## Technical Stack

- **Backend**: Node.js, Express, WebSocket, better-sqlite3
- **Frontend**: React, Vite, Tailwind CSS, Shadcn UI
- **Containerization**: Docker

## Roadmap

Future development is focused on improving the application based on community feedback. Key areas include:

- Expanding the library of platform-specific collectors for other host systems.
- Addressing bugs and incorporating requested changes from the community.

## Contributing

Contributions are welcome! Please feel free to open an issue to report a bug or suggest a feature, or submit a pull request with your improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/Mostafa-Wahied/portracker/blob/main/LICENSE)
