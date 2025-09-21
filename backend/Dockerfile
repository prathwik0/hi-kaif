FROM ghcr.io/astral-sh/uv:python3.12-bookworm

WORKDIR /app

RUN pip install uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

CMD ["uv", "run", "uvicorn", "fastapi_server:app", "--host", "0.0.0.0", "--port", "8000"]
