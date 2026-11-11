{{/*
Common labels applied to every resource in this chart.
Uses Helm chart and release metadata.
*/}}
{{- define "flotilla.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: flotilla
{{- end }}

{{/*
Selector labels for a specific service component.
Usage: include "flotilla.selectorLabels" (list $componentName .)
*/}}
{{- define "flotilla.selectorLabels" -}}
{{- $component := index . 0 -}}
{{- $root := index . 1 -}}
app.kubernetes.io/name: {{ $component }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
{{- end }}

{{/*
Full image reference for a Flotilla service.
Usage: include "flotilla.image" (list . $serviceName)
When global.imageTag is empty, falls back to .Chart.AppVersion.
Examples:
  default values → ghcr.io/bukovinszkiakos/flotilla-auth-service:0.1.0
  local values   → local/flotilla-auth-service:dev
*/}}
{{- define "flotilla.image" -}}
{{- $root := index . 0 -}}
{{- $service := index . 1 -}}
{{- $tag := $root.Values.global.imageTag | default $root.Chart.AppVersion -}}
{{- printf "%s/flotilla-%s:%s" $root.Values.global.imageRegistry $service $tag -}}
{{- end }}
