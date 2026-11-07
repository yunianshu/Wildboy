package com.wildboy;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;

/** Monetary cents and category ordering must not silently truncate decimal JSON values. */
public class StrictIntegerDeserializer extends StdDeserializer<Integer> {
  public StrictIntegerDeserializer() { super(Integer.class); }

  @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
    if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT))
      return (Integer) context.handleUnexpectedToken(Integer.class, parser);
    return parser.getIntValue();
  }
}
