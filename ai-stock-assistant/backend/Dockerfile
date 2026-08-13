FROM python:3.12-slim

WORKDIR /app

# Non-root user for runtime
RUN useradd --create-home --uid 10001 appuser

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application into /app
# (.dockerignore excludes venv/, data/, tests/, scripts/, etc.)
COPY . .

# Ensure the data directory exists (overridden at runtime by the volume mount)
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# slim image has no curl; probe /health with python's urllib
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

# Production: no --reload; Python path is /app because WORKDIR is /app
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
