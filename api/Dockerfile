# Use Python 3.13-slim — patched Debian base with fewer CVEs than 3.11-slim
FROM python:3.13-slim

WORKDIR /app

# Install pip requirements
# psycopg2-binary is a self-contained wheel — no gcc or libpq-dev needed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Run as non-root user for security
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Run database migrations and start the server
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info"]
