FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Take Debian's security fixes released after the base image was built (the
# Trivy image scan fails CI on fixed HIGH/CRITICAL CVEs, e.g. zlib CVE-2026-76844
# / CVE-2026-85091 fixed in 1:1.3.dfsg+really1.3.1-1+deb13u1).
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY main.py .

# The app listens on 5174 everywhere (compose port maps, healthchecks, the Vite
# dev proxy, and apps/web/nginx.conf all assume it). This previously said 8000,
# which left nothing listening on the port compose actually probed.
EXPOSE 5174

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5174"]
