import json
from groq import Groq

class GroqPool:
    def __init__(self, api_keys: list[str], model: str = "llama3-70b-8192"):
        self.api_keys = [k for k in (api_keys or []) if k and not k.startswith("your_")]
        if not self.api_keys:
            self.api_keys = api_keys or ["dummy_key"]
        self.model = model
        self.current_index = 0

    def _get_client(self):
        key = self.api_keys[self.current_index]
        return Groq(api_key=key)

    async def map_fields_batch(self, fields: list[dict], resume_text: str) -> dict:
        """
        Sends a rich set of field descriptors to the LLM and asks for a mapping.
        """
        prompt = f"""
        You are an expert job application assistant. Given the following form fields from a job application,
        and the candidate's resume, provide the value to fill for each unknown field.

        Resume:
        {resume_text}

        Fields:
        {json.dumps(fields, indent=2)}

        Return a JSON object mapping the field's "accessible_name" to the value to fill.
        If a field is a radio/checkbox group, return the text of the option to select.
        If you cannot determine a value, return null for that field.
        """
        client = self._get_client()
        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception:
            # Fallback model attempt if primary model name is deprecated
            try:
                response = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                return json.loads(response.choices[0].message.content)
            except Exception:
                return {}
