from typing import Dict, Any
import sys
import os


from database import db


def get_final_result_tool_definition() -> Dict[str, Any]:
    """Get the definition for the final result tool."""
    return {
        "name": "final_result_tool",
        "description": "The final summary of the deep research task with all findings consolidated.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "A short title for the research topic (just a few words)",
                },
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Array of relevant keywords and key terms related to the research topic",
                },
                "thumbnail": {
                    "type": "string",
                    "format": "uri",
                    "description": "A single thumbnail image URL that represents the research topic (if available)",
                },
                "images": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "format": "uri",
                                "description": "The image URL",
                            },
                            "description": {
                                "type": "string",
                                "description": "Description or caption for the image",
                            },
                        },
                        "required": ["url"],
                    },
                    "description": "Array of images with URLs and descriptions that illustrate the research topic",
                },
                "introduction": {
                    "type": "string",
                    "description": "A brief introduction (150-250 words) explaining the research topic, methodology, and approach",
                },
                "content": {
                    "type": "string",
                    "description": "Detailed content from all research conducted, including all findings, data, and analysis",
                },
                "conclusion": {
                    "type": "string",
                    "description": "Conclusions drawn from the research, including implications, limitations, and future directions",
                },
                "references": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Title of the reference source",
                            },
                            "url": {
                                "type": "string",
                                "description": "URL or source location",
                            },
                            "type": {
                                "type": "string",
                                "description": "Type of source (e.g., 'wikipedia', 'academic_paper', 'website', etc.)",
                            },
                            "accessed_date": {
                                "type": "string",
                                "description": "Date when the source was accessed (ISO format)",
                            },
                        },
                        "required": ["title", "type"],
                    },
                    "description": "Array of references and sources used in the research",
                },
            },
            "required": [
                "title",
                "keywords",
                "introduction",
                "content",
                "conclusion",
                "references",
            ],
        },
    }


async def call_final_result_tool(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Process the final result tool call with research data."""
    # Extract data for database
    title = arguments.get("title", "")
    thumbnail = arguments.get("thumbnail", "")
    keywords = arguments.get("keywords", [])

    # Save to database
    research_id = db.insert_research(
        title=title, thumbnail=thumbnail, keywords=keywords
    )

    return {
        "final_result_tool": True,
        "result": "Final result tool called and executed successfully",
        "research_id": research_id,
        "title": title,
        "keywords": keywords,
        "introduction": arguments.get("introduction", ""),
        "content": arguments.get("content", ""),
        "conclusion": arguments.get("conclusion", ""),
        "references": arguments.get("references", []),
        "thumbnail": thumbnail,
        "images": arguments.get("images", []),
        "timestamp": "2025-01-01T00:00:00Z",
        "success": True,
        "processed": True,
    }
