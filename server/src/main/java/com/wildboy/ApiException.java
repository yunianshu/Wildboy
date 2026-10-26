package com.wildboy;

public class ApiException extends RuntimeException {
  final int status;
  final String code;

  public ApiException(int status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static ApiException notFound() {
    return new ApiException(404, "NOT_FOUND", "资源不存在");
  }

  static ApiException conflict(String code, String message) {
    return new ApiException(409, code, message);
  }
}
