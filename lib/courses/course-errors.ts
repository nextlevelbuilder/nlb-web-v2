/** HTTP-mappable failure raised by the Courses domain. Routes translate it into `{ error, code }`. */
export class CourseError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 502 | 503,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CourseError";
  }
}

export const courseNotFound = () => new CourseError(404, "video_not_found", "Video not found");
