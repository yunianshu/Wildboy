package com.wildboy;

import static com.wildboy.AddressModels.*;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AddressService {
  private final JdbcTemplate db;
  public AddressService(JdbcTemplate db) { this.db = db; }
  private final RowMapper<Address> mapper = (r, n) -> new Address(
      r.getString("id"), r.getString("recipient_name"), r.getString("phone"),
      r.getString("address"), r.getBoolean("is_default"));

  public AddressList list(String userId) {
    return new AddressList(db.query(
        "SELECT * FROM shipping_address WHERE user_id=? ORDER BY is_default DESC,created_at,id", mapper, userId));
  }
  private Address owned(String userId, String id) {
    return db.query("SELECT * FROM shipping_address WHERE user_id=? AND id=?", mapper, userId, id)
        .stream().findFirst().orElseThrow(ApiException::notFound);
  }
  // Serialize address mutations even when the user's address book is empty.
  private void lockOwner(String userId) {
    if (db.queryForList("SELECT id FROM app_user WHERE id=? FOR UPDATE", String.class, userId).isEmpty())
      throw new ApiException(401, "UNAUTHENTICATED", "请先登录");
  }
  private AddressInput normalized(AddressInput input) {
    String name = input.recipientName() == null ? "" : input.recipientName().strip();
    String phone = input.phone() == null ? "" : input.phone().strip();
    String address = input.address() == null ? "" : input.address().strip();
    if (name.length() < 2 || name.length() > 40 || !phone.matches("1[3-9][0-9]{9}")
        || address.length() < 5 || address.length() > 300)
      throw new ApiException(400, "INVALID_ADDRESS", "请填写有效的收货人、手机号和完整地址");
    return new AddressInput(name, phone, address, input.isDefault());
  }
  @Transactional
  public Address create(String userId, AddressInput input) {
    var value = normalized(input);
    lockOwner(userId);
    int count = db.queryForObject("SELECT count(*) FROM shipping_address WHERE user_id=?", Integer.class, userId);
    if (count >= 20) throw new ApiException(409, "ADDRESS_LIMIT", "最多保存 20 个地址");
    boolean makeDefault = value.isDefault() || count == 0;
    if (makeDefault) clearDefault(userId);
    String id = UUID.randomUUID().toString();
    db.update("INSERT INTO shipping_address(id,user_id,recipient_name,phone,address,is_default) VALUES(?,?,?,?,?,?)",
        id, userId, value.recipientName(), value.phone(), value.address(), makeDefault);
    return owned(userId, id);
  }
  @Transactional
  public Address update(String userId, String id, AddressInput input) {
    var value = normalized(input);
    lockOwner(userId);
    var existing = owned(userId, id);
    // Keep a default until another address is explicitly selected as default.
    boolean makeDefault = value.isDefault() || existing.isDefault();
    if (makeDefault) clearDefault(userId);
    db.update("UPDATE shipping_address SET recipient_name=?,phone=?,address=?,is_default=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?",
        value.recipientName(), value.phone(), value.address(), makeDefault, userId, id);
    return owned(userId, id);
  }
  @Transactional
  public void delete(String userId, String id) {
    lockOwner(userId);
    var existing = owned(userId, id);
    db.update("DELETE FROM shipping_address WHERE user_id=? AND id=?", userId, id);
    if (existing.isDefault()) db.update(
        "UPDATE shipping_address SET is_default=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM shipping_address WHERE user_id=? ORDER BY created_at,id LIMIT 1)", userId);
  }
  private void clearDefault(String userId) {
    db.update("UPDATE shipping_address SET is_default=FALSE WHERE user_id=? AND is_default", userId);
  }
}
