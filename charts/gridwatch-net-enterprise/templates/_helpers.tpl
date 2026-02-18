{{/*
Expand the name of the chart.
*/}}
{{- define "gridwatch.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "gridwatch.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "gridwatch.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "gridwatch.labels" -}}
helm.sh/chart: {{ include "gridwatch.chart" . }}
{{ include "gridwatch.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "gridwatch.selectorLabels" -}}
app.kubernetes.io/name: {{ include "gridwatch.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "gridwatch.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "gridwatch.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Generate image name with registry
*/}}
{{- define "gridwatch.image" -}}
{{- $registry := .Values.global.imageRegistry -}}
{{- $repository := .image.repository -}}
{{- $tag := .image.tag | default .Chart.AppVersion -}}
{{- printf "%s/%s:%s" $registry $repository $tag }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "gridwatch.postgresHost" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "gridwatch.fullname" .) }}
{{- else }}
{{- .Values.externalPostgres.host }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "gridwatch.redisHost" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "gridwatch.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
NATS host
*/}}
{{- define "gridwatch.natsHost" -}}
{{- if .Values.nats.enabled }}
{{- printf "%s-nats" (include "gridwatch.fullname" .) }}
{{- else }}
{{- .Values.externalNats.host }}
{{- end }}
{{- end }}
