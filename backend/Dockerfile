FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY main.py .

# The app listens on 5174 everywhere (compose port maps, healthchecks, the Vite
# dev proxy, and apps/web/nginx.conf all assume it). This previously said 8000,
# which left nothing listening on the port compose actually probed.
EXPOSE 5174

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5174"]
